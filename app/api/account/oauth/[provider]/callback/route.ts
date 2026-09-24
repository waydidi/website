import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerIdentities, customers } from "@/db/schema";
import { cookieValue } from "@/lib/booking-management";
import { createCustomerSession } from "@/lib/customer-auth";
import { accountCookie } from "@/lib/customer-account";
import { exchangeForProfile, flowCookie, isSocialProvider, OAUTH_COOKIE, readFlowCookie, stateMatches, type SocialProfile, type SocialProvider } from "@/lib/social-auth";
import { safeOrigin } from "@/lib/security";

type Params = { params: Promise<{ provider: string }> };

function redirect(request: Request, path: string, cookies: string[]) {
  const headers = new Headers({ Location: new URL(path, request.url).toString(), "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new NextResponse(null, { status: 303, headers });
}

/** Finds the customer for this identity, linking or creating by verified email. */
async function customerFor(provider: SocialProvider, profile: SocialProfile) {
  const db = getDb();
  const now = new Date().toISOString();
  const [linked] = await db.select({ customer: customers, identityId: customerIdentities.id }).from(customerIdentities)
    .innerJoin(customers, eq(customers.id, customerIdentities.customerId))
    .where(and(eq(customerIdentities.provider, provider), eq(customerIdentities.providerUserId, profile.providerUserId))).limit(1);
  if (linked) {
    await db.update(customerIdentities).set({ lastUsedAt: now, email: profile.email }).where(eq(customerIdentities.id, linked.identityId));
    return linked.customer;
  }
  // Linking to an existing account by email is only safe when the provider has verified that email.
  if (!profile.email || !profile.emailVerified) return null;
  let [customer] = await db.select().from(customers).where(eq(customers.email, profile.email)).limit(1);
  if (!customer) {
    [customer] = await db.insert(customers).values({
      id: crypto.randomUUID(), email: profile.email, name: profile.firstName, surname: profile.lastName,
      createdAt: now, updatedAt: now, lastSeenAt: now,
    }).onConflictDoNothing().returning();
    customer ??= (await db.select().from(customers).where(eq(customers.email, profile.email)).limit(1))[0];
  } else if (!customer.name && (profile.firstName || profile.lastName)) {
    await db.update(customers).set({ name: profile.firstName, surname: customer.surname ?? profile.lastName, updatedAt: now }).where(eq(customers.id, customer.id));
  }
  await db.insert(customerIdentities).values({
    id: crypto.randomUUID(), customerId: customer.id, provider, providerUserId: profile.providerUserId, email: profile.email, createdAt: now, lastUsedAt: now,
  }).onConflictDoNothing();
  return customer;
}

async function handle(request: Request, providerParam: string, input: URLSearchParams) {
  const clear = flowCookie(null);
  const fail = (error: string) => redirect(request, `/account/sign-in?error=${error}`, [clear]);
  const flow = readFlowCookie(cookieValue(request, OAUTH_COOKIE));
  if (!isSocialProvider(providerParam) || !flow || flow.provider !== providerParam || !stateMatches(flow.state, input.get("state"))) return fail("expired");
  if (input.get("error")) return fail("cancelled");
  const code = input.get("code");
  if (!code || code.length > 2000) return fail("failed");
  let profile: SocialProfile;
  try {
    profile = await exchangeForProfile(flow.provider, env as unknown as Record<string, string | undefined>, safeOrigin(request), code, flow, input.get("user"));
  } catch (error) {
    console.error("Social sign-in failed", flow.provider, error instanceof Error ? error.message : error);
    return fail("failed");
  }
  const customer = await customerFor(flow.provider, profile);
  if (!customer) return fail("no_email");
  const token = await createCustomerSession(customer.id, request.headers.get("user-agent"));
  return redirect(request, flow.next, [clear, accountCookie(token)]);
}

export async function GET(request: Request, context: Params) {
  const { provider } = await context.params;
  return handle(request, provider, new URL(request.url).searchParams);
}

// Apple returns with a form POST (response_mode=form_post).
export async function POST(request: Request, context: Params) {
  const { provider } = await context.params;
  const form = await request.formData().catch(() => null);
  const input = new URLSearchParams();
  form?.forEach((value, key) => { if (typeof value === "string") input.set(key, value); });
  return handle(request, provider, input);
}

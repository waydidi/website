import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerBillingProfiles } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { MAX_BILLING_PROFILES, validateBillingProfile } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { billingProfilesFor, storedBillingProfile } from "@/lib/billing-profiles";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ profiles: [] }, { headers: noStore });
  const profiles = await billingProfilesFor(session.customer.id);
  return NextResponse.json({ profiles }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = validateBillingProfile((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const [{ total }] = await getDb().select({ total: count() }).from(customerBillingProfiles).where(eq(customerBillingProfiles.customerId, session.customer.id));
  if (total >= MAX_BILLING_PROFILES) return NextResponse.json({ error: `You can save up to ${MAX_BILLING_PROFILES} billing profiles.` }, { status: 400 });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDb().insert(customerBillingProfiles).values({ id, customerId: session.customer.id, ...(await storedBillingProfile(result.value)), createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, id, profile: { id, ...result.value } }, { headers: noStore });
}

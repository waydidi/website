import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cookieValue } from "@/lib/booking-management";
import { createCustomerSession } from "@/lib/customer-auth";
import { accountCookie } from "@/lib/customer-account";
import { exchangeForProfile, flowCookie, isSocialProvider, OAUTH_COOKIE, readFlowCookie, stateMatches, type SocialProfile } from "@/lib/social-auth";
import { customerFor } from "@/lib/social-customer";
import { safeOrigin } from "@/lib/security";

type Params = { params: Promise<{ provider: string }> };

function redirect(request: Request, path: string, cookies: string[]) {
  const headers = new Headers({ Location: new URL(path, request.url).toString(), "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new NextResponse(null, { status: 303, headers });
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

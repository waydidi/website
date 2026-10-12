import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { createCustomerSession, customerFromRequest, overRateLimit } from "@/lib/customer-auth";
import { accountCookie } from "@/lib/customer-account";
import { verifyLiffIdToken } from "@/lib/liff";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { customerFor, linkIdentity } from "@/lib/social-customer";

// Signs a customer in from inside LINE. The ID token comes from the LIFF SDK and is verified
// with LINE here; the browser's own claims about who it is are never trusted.
const vars = () => env as unknown as Record<string, string | undefined>;
const json = (body: unknown, status = 200, cookie?: string) => {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
};

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return json({ error: "Request blocked" }, 403);
  const liffId = vars().LINE_LIFF_ID;
  if (!liffId) return json({ error: "not_configured" }, 404);
  if (await overRateLimit(request, "liff-session", 30, 15, vars().RATE_LIMIT_SALT ?? "waydidi")) return json({ error: "rate_limited" }, 429);
  const input = await request.json().catch(() => ({})) as { idToken?: unknown };
  let profile;
  try { profile = await verifyLiffIdToken(input.idToken, liffId); }
  catch (error) { console.error("LIFF sign-in failed", error instanceof Error ? error.message : error); return json({ error: "invalid_token" }, 401); }

  let customer = await customerFor("line", profile);
  if (!customer) {
    // LINE shared no verified email. A customer already signed in on this browser (by email
    // code) has proved who they are, so their LINE account is linked to them once.
    const current = await customerFromRequest(request);
    if (current && await linkIdentity(current.customer.id, "line", profile)) customer = current.customer;
  }
  if (!customer) return json({ error: "no_email" }, 409);
  const token = await createCustomerSession(customer.id, request.headers.get("user-agent"));
  return json({ ok: true, name: customer.name }, 200, accountCookie(token));
}

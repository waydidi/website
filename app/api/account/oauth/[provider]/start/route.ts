import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { overRateLimit } from "@/lib/customer-auth";
import { authorizationUrl, configuredProviders, flowCookie, isSocialProvider, randomToken, safeNextPath } from "@/lib/social-auth";
import { safeOrigin } from "@/lib/security";

// Begins social sign-in: remembers state/PKCE/nonce in a short-lived cookie
// and sends the customer to the provider.
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const signIn = (error: string) => NextResponse.redirect(new URL(`/account/sign-in?error=${error}`, url));
  const vars = env as unknown as Record<string, string | undefined>;
  if (!isSocialProvider(provider) || !configuredProviders(vars).includes(provider)) return signIn("unavailable");
  if (await overRateLimit(request, "account-oauth", 20, 15, vars.RATE_LIMIT_SALT ?? "waydidi")) return signIn("rate_limited");
  const flow = { provider, state: randomToken(), verifier: randomToken(48), nonce: randomToken(), next: safeNextPath(url.searchParams.get("next")) };
  const target = await authorizationUrl(provider, vars, safeOrigin(request), flow);
  return new NextResponse(null, { status: 302, headers: { Location: target, "Set-Cookie": flowCookie(flow), "Cache-Control": "no-store" } });
}

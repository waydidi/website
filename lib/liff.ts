import type { SocialProfile } from "@/lib/social-auth";

// LINE LIFF: Waydidi pages opened inside the LINE app. The browser gets an ID token from the
// LIFF SDK; the server verifies it with LINE before signing the customer in. Kept free of
// runtime imports so it is unit tested directly (tests/liff.test.mjs).

/** A LIFF ID is "<LINE Login channel id>-<suffix>"; the channel id is the token's audience. */
export function liffChannelId(liffId: unknown) {
  const match = typeof liffId === "string" ? liffId.trim().match(/^(\d{6,20})-[A-Za-z0-9]{4,40}$/) : null;
  return match ? match[1] : null;
}

/** Pages a LIFF sign-in may continue to: only Waydidi's own LIFF and account pages. */
export function safeLiffNext(value: unknown) {
  return typeof value === "string" && /^\/(liff|account)(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_-]*)?$/.test(value) && !value.includes("//") && value.length < 200 ? value : "/liff/trips";
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null);

/**
 * Verifies a LIFF ID token with LINE (signature, audience, expiry) and returns the profile.
 * Throws if LINE rejects it. LIFF tokens carry no nonce of ours, so none is checked; the
 * token is short-lived and audience-bound to this channel.
 */
export async function verifyLiffIdToken(idToken: unknown, liffId: string, fetchImpl: typeof fetch = fetch): Promise<SocialProfile> {
  const channel = liffChannelId(liffId);
  if (!channel) throw new Error("LIFF is not configured");
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4000 || idToken.split(".").length !== 3) throw new Error("Malformed ID token");
  const response = await fetchImpl("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ id_token: idToken, client_id: channel }), signal: AbortSignal.timeout(8000),
  });
  const claims = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`LINE rejected the ID token (${response.status})`);
  // LINE checks these too; checked again so a misbehaving response cannot sign anyone in.
  if (claims.iss !== "https://access.line.me" || claims.aud !== channel || typeof claims.sub !== "string" || !claims.sub) throw new Error("ID token was not issued for Waydidi");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now() - 60_000) throw new Error("ID token has expired");
  const [first, ...rest] = (text(claims.name) ?? "").split(" ");
  return { providerUserId: claims.sub, email: text(claims.email)?.toLowerCase() ?? null, emailVerified: Boolean(text(claims.email)), firstName: first || null, lastName: rest.join(" ") || null };
}

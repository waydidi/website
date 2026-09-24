// Social sign-in (Google, Apple, LINE, Facebook) for customer accounts.
//
// Every provider uses the server-side authorization-code flow with a random
// `state` (stored in an HttpOnly cookie) to stop login CSRF, plus PKCE and an
// OpenID `nonce` where the provider supports them. Client secrets never
// leave the Worker. A provider is only offered once its credentials exist.

export const SOCIAL_PROVIDERS = ["google", "apple", "line", "facebook"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const OAUTH_COOKIE = "waydidi_oauth";
const OAUTH_COOKIE_PATH = "/api/account/oauth";
const FACEBOOK_API = "https://graph.facebook.com/v19.0";

type Env = Record<string, string | undefined>;

export type SocialProfile = {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
};

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

/** Which providers have the credentials they need. */
export function configuredProviders(env: Env): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((provider) => {
    if (provider === "google") return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
    if (provider === "facebook") return Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
    if (provider === "line") return Boolean(env.LINE_LOGIN_CHANNEL_ID && env.LINE_LOGIN_CHANNEL_SECRET);
    return Boolean(env.APPLE_SIGNIN_CLIENT_ID && env.APPLE_SIGNIN_TEAM_ID && env.APPLE_SIGNIN_KEY_ID && env.APPLE_SIGNIN_PRIVATE_KEY);
  });
}

export function redirectUri(origin: string, provider: SocialProvider) {
  return `${origin}${OAUTH_COOKIE_PATH}/${provider}/callback`;
}

// ---- small encoding helpers -------------------------------------------------

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlText(text: string) {
  return base64Url(new TextEncoder().encode(text));
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Claims of a JWT that came straight from the provider's token endpoint over TLS. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Malformed ID token");
  return JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
}

/** Only same-site paths are allowed as the page to return to. */
export function safeNextPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") && value.length < 300 ? value : "/account";
}

// ---- the short-lived flow cookie ---------------------------------------------

export type FlowState = { provider: SocialProvider; state: string; verifier: string; nonce: string; next: string };

export function flowCookie(flow: FlowState | null) {
  // SameSite=None: Apple returns with a cross-site form POST, which Lax cookies would not accompany.
  const value = flow ? base64UrlText(JSON.stringify(flow)) : "";
  return `${OAUTH_COOKIE}=${value}; Path=${OAUTH_COOKIE_PATH}; HttpOnly; Secure; SameSite=None; Max-Age=${flow ? 600 : 0}`;
}

export function readFlowCookie(raw: string): FlowState | null {
  if (!raw || raw.length > 2000) return null;
  try {
    const flow = JSON.parse(new TextDecoder().decode(fromBase64Url(raw))) as FlowState;
    return isSocialProvider(flow.provider) && flow.state && flow.verifier && flow.nonce ? flow : null;
  } catch {
    return null;
  }
}

/** Constant-time comparison of the returned state with the cookie's. */
export function stateMatches(expected: string, received: string | null) {
  if (!received || expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

// ---- step 1: where to send the customer ---------------------------------------

export async function authorizationUrl(provider: SocialProvider, env: Env, origin: string, flow: FlowState) {
  const redirect = redirectUri(origin, provider);
  const challenge = await pkceChallenge(flow.verifier);
  if (provider === "google") {
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: redirect, response_type: "code", scope: "openid email profile",
      state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
    })}`;
  }
  if (provider === "line") {
    return `https://access.line.me/oauth2/v2.1/authorize?${new URLSearchParams({
      response_type: "code", client_id: env.LINE_LOGIN_CHANNEL_ID!, redirect_uri: redirect, scope: "openid profile email",
      state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: "S256",
    })}`;
  }
  if (provider === "facebook") {
    return `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID!, redirect_uri: redirect, response_type: "code", scope: "email,public_profile", state: flow.state,
    })}`;
  }
  // Apple posts the result back (form_post) whenever name or email is requested.
  return `https://appleid.apple.com/auth/authorize?${new URLSearchParams({
    client_id: env.APPLE_SIGNIN_CLIENT_ID!, redirect_uri: redirect, response_type: "code", response_mode: "form_post",
    scope: "name email", state: flow.state, nonce: flow.nonce,
  })}`;
}

// ---- Apple's client secret: a short-lived ES256 JWT ---------------------------

function pemToPkcs8(pem: string) {
  const body = pem.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export async function appleClientSecret(env: Env, now = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(env.APPLE_SIGNIN_PRIVATE_KEY!), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = base64UrlText(JSON.stringify({ alg: "ES256", kid: env.APPLE_SIGNIN_KEY_ID }));
  const payload = base64UrlText(JSON.stringify({ iss: env.APPLE_SIGNIN_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: env.APPLE_SIGNIN_CLIENT_ID }));
  // WebCrypto returns the raw r||s signature, which is exactly what JWS ES256 uses.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64Url(signature)}`;
}

// ---- step 2: code -> verified profile -----------------------------------------

async function postForm(url: string, body: Record<string, string>) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Token request failed (${response.status})`);
  return data;
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null);

/** Checks an ID token's issuer, audience, expiry and nonce. */
export function checkIdToken(claims: Record<string, unknown>, expected: { issuers: string[]; audience: string; nonce: string }, now = Date.now() / 1000) {
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(expected.audience) : aud === expected.audience;
  if (!expected.issuers.includes(String(claims.iss)) || !audOk) throw new Error("ID token was not issued for Waydidi");
  if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new Error("ID token has expired");
  if (claims.nonce !== expected.nonce) throw new Error("ID token nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("ID token has no subject");
}

export async function exchangeForProfile(provider: SocialProvider, env: Env, origin: string, code: string, flow: FlowState, appleUser?: string | null): Promise<SocialProfile> {
  const redirect = redirectUri(origin, provider);

  if (provider === "google") {
    const tokens = await postForm("https://oauth2.googleapis.com/token", {
      code, client_id: env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!, redirect_uri: redirect,
      grant_type: "authorization_code", code_verifier: flow.verifier,
    });
    checkIdToken(decodeJwtPayload(String(tokens.id_token)), { issuers: ["https://accounts.google.com", "accounts.google.com"], audience: env.GOOGLE_OAUTH_CLIENT_ID!, nonce: flow.nonce });
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!response.ok) throw new Error("Could not read the Google profile");
    const info = (await response.json()) as Record<string, unknown>;
    return { providerUserId: String(info.sub), email: text(info.email)?.toLowerCase() ?? null, emailVerified: info.email_verified === true, firstName: text(info.given_name), lastName: text(info.family_name) };
  }

  if (provider === "line") {
    const tokens = await postForm("https://api.line.me/oauth2/v2.1/token", {
      grant_type: "authorization_code", code, redirect_uri: redirect, client_id: env.LINE_LOGIN_CHANNEL_ID!,
      client_secret: env.LINE_LOGIN_CHANNEL_SECRET!, code_verifier: flow.verifier,
    });
    // LINE's verify endpoint checks the signature, audience, expiry and nonce for us.
    const claims = await postForm("https://api.line.me/oauth2/v2.1/verify", { id_token: String(tokens.id_token), client_id: env.LINE_LOGIN_CHANNEL_ID!, nonce: flow.nonce });
    const [first, ...rest] = (text(claims.name) ?? "").split(" ");
    // LINE only returns an email the user has registered and agreed to share.
    return { providerUserId: String(claims.sub), email: text(claims.email)?.toLowerCase() ?? null, emailVerified: Boolean(claims.email), firstName: first || null, lastName: rest.join(" ") || null };
  }

  if (provider === "facebook") {
    const tokenUrl = `${FACEBOOK_API}/oauth/access_token?${new URLSearchParams({ client_id: env.FACEBOOK_APP_ID!, client_secret: env.FACEBOOK_APP_SECRET!, redirect_uri: redirect, code })}`;
    const tokenResponse = await fetch(tokenUrl);
    const tokens = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") throw new Error("Facebook sign-in failed");
    const proof = await hmacHex(env.FACEBOOK_APP_SECRET!, tokens.access_token);
    const me = await fetch(`${FACEBOOK_API}/me?${new URLSearchParams({ fields: "id,first_name,last_name,email", access_token: tokens.access_token, appsecret_proof: proof })}`);
    if (!me.ok) throw new Error("Could not read the Facebook profile");
    const info = (await me.json()) as Record<string, unknown>;
    // Facebook only returns an email address the person has confirmed.
    return { providerUserId: String(info.id), email: text(info.email)?.toLowerCase() ?? null, emailVerified: Boolean(info.email), firstName: text(info.first_name), lastName: text(info.last_name) };
  }

  const tokens = await postForm("https://appleid.apple.com/auth/token", {
    client_id: env.APPLE_SIGNIN_CLIENT_ID!, client_secret: await appleClientSecret(env), code, grant_type: "authorization_code", redirect_uri: redirect,
  });
  const claims = decodeJwtPayload(String(tokens.id_token));
  checkIdToken(claims, { issuers: ["https://appleid.apple.com"], audience: env.APPLE_SIGNIN_CLIENT_ID!, nonce: flow.nonce });
  // Apple sends the name only on the very first sign-in, in the posted `user` field.
  let name: { firstName?: unknown; lastName?: unknown } = {};
  try { name = (JSON.parse(appleUser ?? "{}") as { name?: typeof name }).name ?? {}; } catch { /* no name supplied */ }
  return {
    providerUserId: String(claims.sub),
    email: text(claims.email)?.toLowerCase() ?? null,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    firstName: text(name.firstName),
    lastName: text(name.lastName),
  };
}

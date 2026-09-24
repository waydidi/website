import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const social = await vite.ssrLoadModule("/lib/social-auth.ts");
const callback = await readFile(new URL("../app/api/account/oauth/[provider]/callback/route.ts", import.meta.url), "utf8");

const env = {
  GOOGLE_OAUTH_CLIENT_ID: "g-id", GOOGLE_OAUTH_CLIENT_SECRET: "g-secret",
  LINE_LOGIN_CHANNEL_ID: "l-id", LINE_LOGIN_CHANNEL_SECRET: "l-secret",
  FACEBOOK_APP_ID: "f-id", FACEBOOK_APP_SECRET: "f-secret",
};
const flow = { provider: "google", state: "state-123", verifier: "v".repeat(64), nonce: "nonce-abc", next: "/account" };
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

test("only providers with credentials are offered", () => {
  assert.deepEqual(social.configuredProviders({}), []);
  assert.deepEqual(social.configuredProviders(env), ["google", "line", "facebook"]);
  assert.deepEqual(social.configuredProviders({ GOOGLE_OAUTH_CLIENT_ID: "x" }), []);
});

test("authorization URLs carry state, nonce and PKCE", async () => {
  const google = new URL(await social.authorizationUrl("google", env, "https://waydidi.com", flow));
  assert.equal(google.searchParams.get("state"), "state-123");
  assert.equal(google.searchParams.get("nonce"), "nonce-abc");
  assert.equal(google.searchParams.get("code_challenge_method"), "S256");
  assert.equal(google.searchParams.get("code_challenge"), await social.pkceChallenge(flow.verifier));
  assert.equal(google.searchParams.get("redirect_uri"), "https://waydidi.com/api/account/oauth/google/callback");
  const line = new URL(await social.authorizationUrl("line", env, "https://waydidi.com", { ...flow, provider: "line" }));
  assert.match(line.searchParams.get("scope"), /email/);
  const apple = new URL(await social.authorizationUrl("apple", { APPLE_SIGNIN_CLIENT_ID: "com.waydidi" }, "https://waydidi.com", { ...flow, provider: "apple" }));
  assert.equal(apple.searchParams.get("response_mode"), "form_post");
});

test("the flow cookie round-trips and is cross-site-POST safe for Apple", () => {
  const cookie = social.flowCookie(flow);
  assert.match(cookie, /HttpOnly; Secure; SameSite=None; Max-Age=600/);
  assert.match(cookie, /Path=\/api\/account\/oauth/);
  const value = cookie.split(";")[0].split("=")[1];
  assert.deepEqual(social.readFlowCookie(value), flow);
  assert.equal(social.readFlowCookie("garbage"), null);
  assert.match(social.flowCookie(null), /Max-Age=0/);
});

test("state comparison rejects anything but an exact match", () => {
  assert.equal(social.stateMatches("abc", "abc"), true);
  assert.equal(social.stateMatches("abc", "abd"), false);
  assert.equal(social.stateMatches("abc", null), false);
  assert.equal(social.stateMatches("abc", "abcd"), false);
});

test("ID tokens must match issuer, audience, nonce and not be expired", () => {
  const good = { iss: "https://appleid.apple.com", aud: "com.waydidi", exp: Date.now() / 1000 + 60, nonce: "n", sub: "123" };
  const expect = { issuers: ["https://appleid.apple.com"], audience: "com.waydidi", nonce: "n" };
  social.checkIdToken(good, expect);
  assert.throws(() => social.checkIdToken({ ...good, aud: "other" }, expect));
  assert.throws(() => social.checkIdToken({ ...good, iss: "https://evil" }, expect));
  assert.throws(() => social.checkIdToken({ ...good, nonce: "x" }, expect));
  assert.throws(() => social.checkIdToken({ ...good, exp: 1 }, expect));
});

test("Apple client secret is a valid ES256 JWT", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const appleEnv = { APPLE_SIGNIN_CLIENT_ID: "com.waydidi", APPLE_SIGNIN_TEAM_ID: "TEAM", APPLE_SIGNIN_KEY_ID: "KID", APPLE_SIGNIN_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n") };
  const token = await social.appleClientSecret(appleEnv, 1_700_000_000);
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "ES256", kid: "KID" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), { iss: "TEAM", iat: 1_700_000_000, exp: 1_700_000_300, aud: "https://appleid.apple.com", sub: "com.waydidi" });
  const ok = verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
  assert.equal(ok, true);
});

test("Google sign-in reads a verified email and rejects a wrong nonce", async () => {
  const realFetch = globalThis.fetch;
  const idToken = (nonce) => jwt({ iss: "https://accounts.google.com", aud: "g-id", exp: Date.now() / 1000 + 300, nonce, sub: "g-123" });
  let nonce = "nonce-abc";
  globalThis.fetch = async (url) => String(url).includes("/token")
    ? new Response(JSON.stringify({ access_token: "at", id_token: idToken(nonce) }))
    : new Response(JSON.stringify({ sub: "g-123", email: "Mia@Example.com", email_verified: true, given_name: "Mia", family_name: "Tester" }));
  try {
    const profile = await social.exchangeForProfile("google", env, "https://waydidi.com", "code", flow);
    assert.deepEqual(profile, { providerUserId: "g-123", email: "mia@example.com", emailVerified: true, firstName: "Mia", lastName: "Tester" });
    nonce = "attacker";
    await assert.rejects(social.exchangeForProfile("google", env, "https://waydidi.com", "code", flow));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Facebook requests are signed with appsecret_proof", async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return String(url).includes("access_token?") ? new Response(JSON.stringify({ access_token: "fb-token" })) : new Response(JSON.stringify({ id: "fb-1", email: "a@b.co", first_name: "A", last_name: "B" }));
  };
  try {
    const profile = await social.exchangeForProfile("facebook", env, "https://waydidi.com", "code", { ...flow, provider: "facebook" });
    assert.equal(profile.email, "a@b.co");
    assert.match(seen[1], /appsecret_proof=[0-9a-f]{64}/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("accounts are only linked by email when the provider verified it", () => {
  assert.match(callback, /if \(!profile\.email \|\| !profile\.emailVerified\) return null;/);
  assert.match(callback, /stateMatches\(flow\.state, input\.get\("state"\)\)/);
  assert.match(callback, /flow\.provider !== providerParam/);
  assert.equal(social.safeNextPath("//evil.com"), "/account");
  assert.equal(social.safeNextPath("/account/trips"), "/account/trips");
});

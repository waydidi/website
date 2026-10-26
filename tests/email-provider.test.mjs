import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
globalThis.__emailProviderEnv = { RESEND_API_KEY: "test-only-key", BOOKING_FROM_EMAIL: "Bookings <from@example.invalid>" };
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true }, plugins: [{
  name: "email-provider-env", enforce: "pre",
  resolveId(id) { if (id === "cloudflare:workers") return "\0email-provider-env"; },
  load(id) { if (id === "\0email-provider-env") return "export const env=globalThis.__emailProviderEnv"; },
}] });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await vite.close(); delete globalThis.__emailProviderEnv; });
const rules = await vite.ssrLoadModule("/lib/email-delivery-rules.ts");
const email = await vite.ssrLoadModule("/lib/email.ts");
const input = { to: "private@example.invalid", name: "Private Traveller", surname: "Private", reference: "EMAIL2", pdf: new Uint8Array([1, 2, 3, 4]), pickup: "Private pickup", dropoff: "Private dropoff", pickupDate: "2027-02-01", pickupTime: "10:00", vehicle: "economy_sedan", customerPhone: "+66000000000", passengers: 1, luggage: 0, total: 1000, paymentMethod: "cash", paymentStatus: "cash_due", rideUrl: "https://example.invalid/trip/EMAIL2?token=PRIVATE_TOKEN" };

test("a provider acknowledgment requires a usable message identifier", () => {
  assert.deepEqual(rules.emailProviderOutcome(200, { id: "provider-id_123" }), { status: "sent", providerMessageId: "provider-id_123" });
  for (const value of [null, [], {}, "login page", { id: "" }, { id: 42 }, { id: "private@example.invalid" }, { id: "x".repeat(201) }]) {
    const result = rules.emailProviderOutcome(200, value);
    assert.equal(result.status, "failed"); assert.equal(result.failureCode, "unverified_response"); assert.equal(result.outcomeUnknown, true);
  }
  assert.equal(rules.emailProviderOutcome(202, { id: "provider-id" }).status, "failed");
});

test("permanent errors, rate limits and ambiguous idempotency conflicts stay distinct", () => {
  for (const status of [400, 401, 403, 404, 413, 422]) {
    const result = rules.emailProviderOutcome(status, { message: "private@example.invalid PRIVATE_TOKEN" });
    assert.equal(result.retryable, false); assert.equal(result.outcomeUnknown, false);
    assert.equal(JSON.stringify(result).includes("private@example.invalid"), false);
  }
  assert.equal(rules.emailProviderOutcome(409, { name: "invalid_idempotent_request" }).failureCode, "payload_conflict");
  assert.equal(rules.emailProviderOutcome(409, { name: "invalid_idempotent_request" }).retryable, false);
  assert.equal(rules.emailProviderOutcome(409, { name: "concurrent_idempotent_requests" }).retryable, true);
  assert.equal(rules.emailProviderOutcome(409, { name: "untrusted PRIVATE_TOKEN" }).failureCode, "conflict_unknown");
  for (const status of [0, 408, 425, 500, 503]) {
    const result = rules.emailProviderOutcome(status, null); assert.equal(result.retryable, true); assert.equal(result.outcomeUnknown, true);
  }
  const now = Date.parse("2026-10-26T00:00:00Z");
  assert.equal(rules.emailProviderOutcome(429, {}, "120", now).retryAfterMs, 120000);
  assert.equal(rules.emailRetryAfter("Mon, 26 Oct 2026 00:03:00 GMT", now), 180000);
  assert.equal(rules.emailRetryAfter("invalid", now), undefined);
  assert.equal(rules.emailRetryAfter("99999999", now), 86400000);
});

test("serialized confirmation envelopes keep the same wire body and key across configuration changes", async () => {
  const prepared = JSON.parse(JSON.stringify(email.prepareConfirmationEmail(input)));
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, "error");
    calls.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    return Response.json({ id: "provider-id" });
  };
  const from = globalThis.__emailProviderEnv.BOOKING_FROM_EMAIL;
  try {
    assert.equal((await email.sendPreparedEmail(prepared)).status, "sent");
    globalThis.__emailProviderEnv.BOOKING_FROM_EMAIL = "Changed <changed@example.invalid>";
    assert.equal((await email.sendPreparedEmail(JSON.parse(JSON.stringify(prepared)))).status, "sent");
    assert.deepEqual(calls[0], calls[1]);
    const body = JSON.parse(calls[0].body);
    assert.equal(body.from, from); assert.deepEqual(body.to, [input.to]);
    assert.equal(body.attachments[0].content, "AQIDBA==");
  } finally { globalThis.__emailProviderEnv.BOOKING_FROM_EMAIL = from; globalThis.fetch = originalFetch; }
});

test("transport retains rate-limit metadata and never logs provider payloads or thrown exception messages", async () => {
  const originalError = console.error, logs = [];
  console.error = (...args) => logs.push(JSON.stringify(args));
  try {
    globalThis.fetch = async () => Response.json({ message: "private@example.invalid PRIVATE_TOKEN test-only-key" }, { status: 429, headers: { "Retry-After": "90" } });
    const rate = await email.sendConfirmationEmail(input);
    assert.equal(rate.status, "failed"); assert.equal(rate.retryable, true); assert.equal(rate.retryAfterMs, 90000);
    globalThis.fetch = async () => { throw new Error("private@example.invalid PRIVATE_TOKEN test-only-key"); };
    const lost = await email.sendConfirmationEmail(input);
    assert.equal(lost.outcomeUnknown, true); assert.equal(lost.failureCode, "network_unknown");
    globalThis.fetch = async () => new Response("private@example.invalid PRIVATE_TOKEN", { status: 200 });
    assert.equal((await email.sendConfirmationEmail(input)).failureCode, "unverified_response");
    const text = logs.join("\n");
    for (const secret of ["private@example.invalid", "PRIVATE_TOKEN", "test-only-key"]) assert.equal(text.includes(secret), false);
    assert.match(text, /rate_limited/); assert.match(text, /network_unknown/);
  } finally { console.error = originalError; globalThis.fetch = originalFetch; }
});

test("missing email credentials do not make a provider request", async () => {
  const key = globalThis.__emailProviderEnv.RESEND_API_KEY;
  globalThis.fetch = async () => { throw new Error("Unexpected provider request"); };
  try {
    delete globalThis.__emailProviderEnv.RESEND_API_KEY;
    const result = await email.sendConfirmationEmail(input);
    assert.equal(result.status, "pending_configuration"); assert.equal(result.failureCode, "configuration");
  } finally { globalThis.__emailProviderEnv.RESEND_API_KEY = key; globalThis.fetch = originalFetch; }
});

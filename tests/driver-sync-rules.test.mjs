import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ root, configFile: false, appType: "custom", server: { middlewareMode: true } });
after(() => vite.close());
const rules = await vite.ssrLoadModule("/lib/driver-sync-rules.ts");
const step = { id: "original-event", status: "going_to_standby" };
const acknowledgment = { ok: true, eventId: step.id, status: step.status };

test("only a matching persisted-event acknowledgment completes a queued action", () => {
  assert.equal(rules.driverResponseKind(200, acknowledgment, step), "accepted");
  for (const payload of [null, "sign-in page", {}, { ok: true }, { ...acknowledgment, eventId: "another-event" }, { ...acknowledgment, status: "completed" }, { ...acknowledgment, ok: false }]) {
    assert.equal(rules.driverResponseKind(200, payload, step), "retry");
  }
  assert.equal(rules.driverResponseKind(202, acknowledgment, step), "retry");
});

test("network, rate limits and transient server failures retry, while rejected actions require review", () => {
  for (const status of [0, 204, 408, 425, 429, 500, 503, 504]) assert.equal(rules.driverResponseKind(status, null, step), "retry");
  for (const status of [400, 401, 403, 404, 409, 410, 413, 422]) assert.equal(rules.driverResponseKind(status, { error: "Rejected" }, step), "blocked");
});

test("retry timing backs off and respects server Retry-After seconds and dates", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  assert.equal(Date.parse(rules.driverRetryAt(1, now)) - now, 20000);
  assert.equal(Date.parse(rules.driverRetryAt(2, now)) - now, 40000);
  assert.equal(Date.parse(rules.driverRetryAt(100, now)) - now, 300000);
  assert.equal(Date.parse(rules.driverRetryAt(1, now, "120")) - now, 120000);
  assert.equal(Date.parse(rules.driverRetryAt(1, now, "Sun, 25 Oct 2026 10:03:00 GMT")) - now, 180000);
  assert.equal(Date.parse(rules.driverRetryAt(1, now, "invalid")) - now, 20000);
});

test("manual retry cannot steal a live lease or bypass a rate-limit hold", () => {
  const now = Date.parse("2026-10-25T10:00:00Z"), later = new Date(now + 60000).toISOString();
  assert.equal(rules.mayRetryDriverStep(undefined, now), true);
  assert.equal(rules.mayRetryDriverStep({ ...rules.initialDriverSync(), blocked: true }, now), false);
  assert.equal(rules.mayRetryDriverStep({ ...rules.initialDriverSync(), blocked: true }, now, true), true);
  assert.equal(rules.mayRetryDriverStep({ ...rules.initialDriverSync(), leaseUntil: later }, now, true), false);
  const pending = { ...rules.initialDriverSync(), retryAt: later, httpStatus: 503 };
  assert.equal(rules.mayRetryDriverStep(pending, now), false);
  assert.equal(rules.mayRetryDriverStep(pending, now, true), true);
  assert.equal(rules.mayRetryDriverStep({ ...pending, httpStatus: 429 }, now, true), false);
  assert.equal(rules.mayRetryDriverStep({ ...pending, httpStatus: 429 }, now + 60001), true);
});

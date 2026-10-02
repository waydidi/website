import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(() => vite.close());
const policy = await vite.ssrLoadModule("/lib/refund-policy.ts");

const start = policy.serviceStartMs("2026-12-28", "15:00");
const at = (hoursBefore) => policy.noticeHours(start, start - hoursBefore * 3600_000);
const refund = (hoursBefore, reason = "customer_cancellation") => policy.customerRefundMinor(300000, policy.refundPercent(reason, at(hoursBefore))) / 100;

test("policy examples: 72 h full, 30 h half, 8 h nothing, Waydidi cancellation full", () => {
  assert.equal(refund(72), 3000);
  assert.equal(refund(30), 1500);
  assert.equal(refund(8), 0);
  assert.equal(refund(1, "waydidi_cancellation"), 3000);
  assert.equal(refund(200, "no_show"), 0);
});

test("window edges: more than 48 h is full, exactly 48 h and 24 h are half, under 24 h is none", () => {
  assert.equal(refund(48.01), 3000);
  assert.equal(refund(48), 1500);
  assert.equal(refund(24), 1500);
  assert.equal(refund(23.99), 0);
});

test("service time is read in Thailand time, not UTC", () => {
  assert.equal(start, Date.parse("2026-12-28T08:00:00Z"));
});

test("refunds never exceed what is still refundable", () => {
  assert.equal(policy.customerRefundMinor(300000, 100, 250000), 50000);
  assert.equal(policy.customerRefundMinor(300000, 100, 300000), 0);
  assert.equal(policy.customerRefundMinor(300000, 150), 300000);
});

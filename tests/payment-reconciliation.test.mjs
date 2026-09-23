import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
const { classifyCheckoutSession } = await vite.ssrLoadModule("/lib/payment-status.ts");

test("classifies successful, pending, processing and expired Stripe sessions", () => {
  assert.equal(classifyCheckoutSession({ payment_status: "paid", status: "complete" }), "paid");
  assert.equal(classifyCheckoutSession({ payment_status: "unpaid", status: "open" }), "pending");
  assert.equal(classifyCheckoutSession({ payment_status: "no_payment_required", status: "complete" }), "processing");
  assert.equal(classifyCheckoutSession({ payment_status: "unpaid", status: "expired" }), "expired");
});

test.after(() => vite.close());

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const types = await readFile(new URL("../lib/payments/types.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../lib/payments/provider.ts", import.meta.url), "utf8");
const checkout = await readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../lib/payment-reconciliation.ts", import.meta.url), "utf8");
const refund = await readFile(new URL("../app/api/admin/refunds/route.ts", import.meta.url), "utf8");
const stripeWebhook = await readFile(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
const payso = await readFile(new URL("../lib/payments/payso-provider.ts", import.meta.url), "utf8");

test("payment providers implement one shared contract", () => {
  for (const method of ["createPayment", "retrievePayment", "refundPayment", "verifyWebhook"]) assert.match(types, new RegExp(`${method}\\(`));
  for (const provider of ["stripe", "payso", "cash"]) assert.match(registry, new RegExp(`${provider}:`));
});

test("checkout, reconciliation, refunds and webhook verification use provider adapters", () => {
  assert.match(checkout, /paymentProviderFor\("stripe"\)\.createPayment/);
  assert.match(checkout, /paymentProviderFor\("cash"\)\.createPayment/);
  assert.match(reconciliation, /paymentProviderFor\(provider\)\.retrievePayment/);
  assert.match(refund, /paymentProviderFor\(legacyPaymentProvider\(booking\.paymentMethod\)\)\.refundPayment/);
  assert.match(stripeWebhook, /paymentProviderFor\("stripe"\)\.verifyWebhook/);
});

test("PaySolutions remains explicitly disabled until credentials and signed API integration exist", () => {
  assert.match(payso, /name: "payso"/);
  assert.match(payso, /enabled: false/);
  assert.match(payso, /PAYSO_NOT_CONFIGURED/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const types = await readFile(new URL("../lib/payments/types.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../lib/payments/provider.ts", import.meta.url), "utf8");
const checkout = await readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../lib/payment-reconciliation.ts", import.meta.url), "utf8");
import { access } from "node:fs/promises";
const stripeWebhook = await readFile(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
const payso = await readFile(new URL("../lib/payments/payso-provider.ts", import.meta.url), "utf8");

test("payment providers implement one shared contract", () => {
  for (const method of ["createPayment", "retrievePayment", "refundPayment", "verifyWebhook"]) assert.match(types, new RegExp(`${method}\\(`));
  for (const provider of ["stripe", "payso", "cash"]) assert.match(registry, new RegExp(`${provider}:`));
});

test("checkout, reconciliation and webhook verification use provider adapters", () => {
  assert.match(checkout, /paymentProviderFor\("stripe"\)\.createPayment/);
  assert.match(checkout, /paymentProviderFor\("cash"\)\.createPayment/);
  assert.match(reconciliation, /paymentProviderFor\(provider\)\.retrievePayment/);
  assert.match(stripeWebhook, /paymentProviderFor\("stripe"\)\.verifyWebhook/);
});

test("PaySolutions remains explicitly disabled until credentials and signed API integration exist", () => {
  assert.match(payso, /name: "payso"/);
  assert.match(payso, /enabled: false/);
  assert.match(payso, /PAYSO_NOT_CONFIGURED/);
});

test("refunds are handled by email, not by a website endpoint", async () => {
  await assert.rejects(access(new URL("../app/api/admin/refunds/route.ts", import.meta.url)));
  await assert.rejects(access(new URL("../app/api/bookings/manage/cancel/route.ts", import.meta.url)));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const checkout = await readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../lib/payment-reconciliation.ts", import.meta.url), "utf8");
const backfill = await readFile(new URL("../lib/payment-backfill.ts", import.meta.url), "utf8");

test("stores provider-neutral payment identifiers and expected amount", () => {
  assert.match(schema, /booking_payments/);
  for (const column of ["provider_session_id", "provider_transaction_id", "provider_status", "amount_expected"]) assert.match(schema, new RegExp(column));
});

test("new checkout and reconciliation dual-write legacy and unified payment fields", () => {
  assert.match(checkout, /insert\(bookingPayments\)/);
  assert.match(checkout, /provider:/);
  assert.match(checkout, /providerSessionId:\s*session\.sessionId/);
  assert.match(checkout, /amountExpected:\s*total/);
  assert.match(reconciliation, /providerTransactionId:/);
  assert.match(reconciliation, /providerStatus:/);
});

test("legacy payment rows are normalized outside schema migrations", () => {
  assert.match(backfill, /insert\(bookingPayments\)/);
  assert.match(backfill, /unifiedPaymentValues/);
});

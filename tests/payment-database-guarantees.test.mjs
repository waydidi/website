import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0027_real_hardball.sql", import.meta.url), "utf8");
const ledger = await readFile(new URL("../lib/payment-provider-events.ts", import.meta.url), "utf8");
const stripeWebhook = await readFile(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");

test("provider payment identifiers are unique within each provider", () => {
  assert.match(schema, /uniqueIndex\("uidx_booking_payments_provider_session"\)\.on\(table\.provider, table\.providerSessionId\)/);
  assert.match(schema, /uniqueIndex\("uidx_booking_payments_provider_transaction"\)\.on\(table\.provider, table\.providerTransactionId\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `uidx_booking_payments_provider_session`/);
  assert.match(migration, /CREATE UNIQUE INDEX `uidx_booking_payments_provider_transaction`/);
});

test("provider event ledger stores a payload hash rather than raw webhook data", () => {
  assert.match(schema, /export const paymentProviderEvents/);
  assert.match(schema, /payloadHash: text\("payload_hash"\)/);
  assert.doesNotMatch(schema, /rawPayload: text|raw_payload|payload_json/);
  assert.match(ledger, /const payloadHash = await sha256\(input\.rawPayload\)/);
  assert.doesNotMatch(ledger, /rawPayload,\s*$/m);
});

test("Stripe events are claimed before payment side effects and completed afterwards", () => {
  const claimAt = stripeWebhook.indexOf("claimPaymentProviderEvent({");
  const processAt = stripeWebhook.indexOf("await processStripeEvent(event)");
  const completeAt = stripeWebhook.indexOf("await completePaymentProviderEvent(claim.id)");
  assert.ok(claimAt > 0 && processAt > claimAt && completeAt > processAt);
  assert.match(stripeWebhook, /await failPaymentProviderEvent\(claim\.id, error\)/);
  assert.match(stripeWebhook, /claim\.reason === "processing"[^\n]+status: 503/);
  assert.match(ledger, /existing\.payloadHash !== payloadHash/);
  assert.match(ledger, /processingAttempts: sql/);
});

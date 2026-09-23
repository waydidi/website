import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkoutRoute = await readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
const expiryService = await readFile(new URL("../lib/booking-expiry.ts", import.meta.url), "utf8");

test("checkout security uses the configured Waydidi session secret", () => {
  assert.match(checkoutRoute, /env\.WAYDIDI_ADMIN_SESSION_SECRET/);
  assert.doesNotMatch(checkoutRoute, /env\.ADMIN_SESSION_SECRET/);
});

test("abandoned checkout maintenance expires rather than deletes bookings", () => {
  assert.match(checkoutRoute, /expireAbandonedCheckouts\(\)/);
  assert.doesNotMatch(checkoutRoute, /delete\(bookings\)/);
  assert.match(expiryService, /status:\s*"expired"/);
  assert.match(expiryService, /paymentStatus:\s*"expired"/);
  assert.match(expiryService, /eq\(bookings\.paymentStatus,\s*"pending"\)/);
  assert.match(expiryService, /eventType:\s*"checkout_expired"/);
});

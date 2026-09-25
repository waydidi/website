import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const promo = await vite.ssrLoadModule("/lib/promo.ts");

const base = { code: "WAYDIDINEW", title: "x", discountType: "percent", discountValue: 10, maxDiscount: 300, minFare: 1000, startsAt: null, endsAt: null, maxUses: null, perCustomerLimit: 1, firstBookingOnly: true, service: "transfer", vehiclesJson: null, status: "active" };
const ctx = { total: 1500, serviceType: "transfer", vehicle: "economy_sedan", now: new Date("2026-10-10T00:00:00Z"), usesSoFar: 0, customerUses: 0, hasPriorBooking: false };

test("codes are normalised", () => {
  assert.equal(promo.normalizeCode("  waydidi new "), "WAYDIDINEW");
  assert.equal(promo.isCodeShape("AB"), false);
  assert.equal(promo.isCodeShape("PATTAYA200"), true);
});

test("percent discounts respect the cap; fixed discounts never exceed the fare", () => {
  assert.deepEqual(promo.evaluatePromo(base, ctx), { ok: true, discount: 150, finalTotal: 1350 });
  assert.equal(promo.evaluatePromo(base, { ...ctx, total: 5000 }).discount, 300);
  assert.equal(promo.discountFor({ discountType: "fixed", discountValue: 5000, maxDiscount: null }, 1200), 1199);
});

test("rules reject the wrong bookings with a clear reason", () => {
  const no = (rule, c) => promo.evaluatePromo(rule, { ...ctx, ...c });
  assert.match(no({ ...base, status: "paused" }).reason, /isn't valid/);
  assert.match(no(base, { total: 900 }).reason, /minimum fare of THB 1,000/);
  assert.match(no(base, { hasPriorBooking: true }).reason, /first Waydidi booking/);
  assert.match(no(base, { customerUses: 1 }).reason, /already used/);
  assert.match(no({ ...base, maxUses: 10 }, { usesSoFar: 10 }).reason, /fully used/);
  assert.match(no(base, { serviceType: "hourly" }).reason, /private transfers/);
  assert.match(no({ ...base, endsAt: "2026-10-01T00:00:00Z" }).reason, /expired/);
  assert.match(no({ ...base, startsAt: "2026-11-01T00:00:00Z" }).reason, /isn't active yet/);
  assert.match(no({ ...base, vehiclesJson: '["premium_minivan"]' }).reason, /selected car/);
  assert.match(promo.evaluatePromo(null, ctx).reason, /isn't valid/);
});

test("return-journey codes need a round trip transfer", () => {
  const rule = { ...base, service: "return", firstBookingOnly: false, minFare: 0 };
  const ctx = { total: 3000, serviceType: "transfer", vehicle: "economy_sedan", now: new Date(), usesSoFar: 0, customerUses: 0, hasPriorBooking: false };
  assert.equal(promo.evaluatePromo(rule, ctx).ok, false);
  assert.equal(promo.evaluatePromo(rule, { ...ctx, returnTrip: true }).ok, true);
  assert.equal(promo.evaluatePromo(rule, { ...ctx, serviceType: "hourly", returnTrip: true }).ok, false);
});

test("tax invoice fields are required only when requested", async () => {
  const { validateBookingReview } = await import("../lib/booking-review.ts");
  const base = { name: "Anna", surname: "Lee", email: "a@b.co", phone: "+66 81 234 5678", termsAccepted: true };
  assert.deepEqual(validateBookingReview(base), {});
  const missing = validateBookingReview({ ...base, taxInvoice: true, taxName: "", taxId: "123", taxAddress: "" });
  assert.ok(missing.taxName && missing.taxId && missing.taxAddress);
  assert.deepEqual(validateBookingReview({ ...base, taxInvoice: true, taxName: "Acme Co., Ltd.", taxId: "0105 5560-12345", taxAddress: "99 Sukhumvit Rd, Bangkok 10110" }), {});
});

test("billing profile validation", async () => {
  const { validateBillingProfile } = await import("../lib/customer-account.ts");
  assert.equal(validateBillingProfile({ name: "Acme", taxId: "123", address: "99 Sukhumvit Rd, Bangkok" }).ok, false);
  const ok = validateBillingProfile({ name: "Acme Co., Ltd.", taxId: "0105 5560-12345", branch: "", address: "99 Sukhumvit Rd, Bangkok 10110" });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.taxId, "0105556012345");
  assert.equal(ok.value.branch, "Head office");
});

test("confirmation PDF renders the price breakdown, even with a Thai company name", async () => {
  const { createConfirmationPdf } = await vite.ssrLoadModule("/lib/confirmation-pdf.ts");
  const booking = { reference: "ABC123", customerName: "Mia Test", customerEmail: "m@x.co", pickup: "Suvarnabhumi Airport", dropoff: "Hilton Pattaya", pickupDate: "2026-10-30", pickupTime: "08:30", passengers: 2, luggage: 2, vehicle: "Economy sedan", total: 1400, customerPhone: "+66 81 111 2222", flightNumber: null, pickupSign: null, pickupInstructions: null, childSeats: 1, oversizedLuggage: false, specialRequests: null, paymentMethod: "card" };
  const extras = { discount: { code: "NEWUSER20", amount: 300 }, addons: [{ label: "Child seat × 1", amount: 300 }, { label: "Currency exchange stop", amount: 200 }], taxInvoice: { name: "บริษัท เอ บี ซี จำกัด", taxId: "0105556012345", branch: "Head office" } };
  const bytes = await createConfirmationPdf(booking, extras);
  assert.ok(bytes.length > 1000);
});

test("loyalty: every 5th ride is rewarded once", async () => {
  const { loyaltyProgress, loyaltyDiscount } = await vite.ssrLoadModule("/lib/loyalty-rules.ts");
  assert.equal(loyaltyProgress(3, 0).eligible, false);
  assert.equal(loyaltyProgress(4, 0).eligible, true);
  assert.equal(loyaltyProgress(5, 1).eligible, false);
  assert.equal(loyaltyProgress(9, 1).eligible, true);
  assert.equal(loyaltyDiscount(1400), 140);
  assert.equal(loyaltyDiscount(9000), 500);
});

test("free waiting depends on airport pickups", async () => {
  const { waitingLine } = await vite.ssrLoadModule("/lib/waiting-policy.ts");
  assert.match(waitingLine("Suvarnabhumi Airport (BKK)"), /60 minutes/);
  assert.match(waitingLine("Hilton Pattaya"), /15 minutes/);
});

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

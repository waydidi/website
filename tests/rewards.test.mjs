import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { pickPrize, prizeOdds, DEFAULT_PRIZES } = await vite.ssrLoadModule("/lib/reward-rules.ts");
const { couponValue, rewardDiscount, giftInfo } = await vite.ssrLoadModule("/lib/gift-rules.ts");

const prizes = DEFAULT_PRIZES.map((p) => ({ ...p, issued: 0 }));

test("each badge's box only draws its own prizes", () => {
  for (let i = 0; i < 100; i++) {
    const p = pickPrize(prizes, "platinum", i / 100);
    assert.ok((p.weights.platinum ?? 0) > 0, p.id);
  }
});

test("sold-out prizes drop out and odds re-balance", () => {
  const soldOut = prizes.map((p) => (p.id === "dinner-cruise" ? { ...p, issued: p.stock } : p));
  for (let i = 0; i < 100; i++) assert.notEqual(pickPrize(soldOut, "platinum", i / 100).id, "dinner-cruise");
  const odds = prizeOdds(soldOut, "platinum");
  assert.equal(odds.get("dinner-cruise"), undefined);
  assert.equal(odds.get("dinner-buffet") + odds.get("box-transfer"), 100);
});

test("no prize when nothing is open for the badge", () => {
  assert.equal(pickPrize(prizes.map((p) => ({ ...p, active: false })), "gold", 0.5), null);
});

test("reward coupons", () => {
  assert.equal(couponValue("coupon_500"), 500);
  assert.equal(couponValue("child_seat"), 0);
  assert.equal(giftInfo("coupon_200").name, "THB 200 off");
  assert.equal(rewardDiscount(500, 999), 0);
  assert.equal(rewardDiscount(500, 1200), 500);
});

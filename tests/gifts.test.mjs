import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { nearNextTier, freeAddonsWithGifts, freeTransferDiscount } = await vite.ssrLoadModule("/lib/gift-rules.ts");
const { memberTier } = await vite.ssrLoadModule("/lib/member-tier-rules.ts");

test("'almost there' means 1 ride or within 20% of the spend", () => {
  assert.equal(nearNextTier(memberTier(2, 0)), true);   // 1 ride to Gold
  assert.equal(nearNextTier(memberTier(0, 6500)), true); // THB 1,500 to Gold
  assert.equal(nearNextTier(memberTier(0, 0)), false);
  assert.equal(nearNextTier(memberTier(15, 0)), false);  // Platinum: nothing next
});

test("gift vouchers add to the tier's free add-ons, never twice", () => {
  const none = { childSeats: 0, exchangeStop: false };
  assert.deepEqual(freeAddonsWithGifts(none, 1, false, { childSeat: true, exchangeStop: true }), { childSeats: 1, exchangeStop: false, usedGifts: ["child_seat"] });
  const platinum = { childSeats: 1, exchangeStop: true };
  assert.deepEqual(freeAddonsWithGifts(platinum, 1, true, { childSeat: true, exchangeStop: true }), { childSeats: 1, exchangeStop: true, usedGifts: [] });
  assert.deepEqual(freeAddonsWithGifts(platinum, 2, true, { childSeat: true, exchangeStop: true }), { childSeats: 2, exchangeStop: true, usedGifts: ["child_seat"] });
});

test("free transfer covers the fare up to THB 1,500", () => {
  assert.equal(freeTransferDiscount(1400), 1400);
  assert.equal(freeTransferDiscount(2400), 1500);
});

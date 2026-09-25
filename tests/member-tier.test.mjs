import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { memberTier, tierDiscount, TIERS } = await vite.ssrLoadModule("/lib/member-tier-rules.ts");

test("new members start at Bronze with 3% off", () => {
  const s = memberTier(0, 0);
  assert.equal(s.tier.id, "bronze");
  assert.equal(s.next.id, "gold");
  assert.equal(s.ridesToNext, 3);
  assert.equal(tierDiscount(s.tier, 2000), 60);
});

test("rides or spend, whichever is higher, sets the tier", () => {
  assert.equal(memberTier(3, 0).tier.id, "gold");
  assert.equal(memberTier(1, 26000).tier.id, "diamond");
  assert.equal(memberTier(15, 0).tier.id, "platinum");
  assert.equal(memberTier(15, 0).next, null);
});

test("tier discount is capped and never makes a ride free", () => {
  const platinum = TIERS.find((t) => t.id === "platinum");
  assert.equal(tierDiscount(platinum, 50000), 1200);
  assert.equal(tierDiscount(TIERS[0], 1), 0);
});

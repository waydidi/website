import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { pickPrize, spinDiscount, SPIN_PRIZES } = await vite.ssrLoadModule("/lib/spin-rules.ts");

test("every roll lands on a prize, following the weights", () => {
  assert.equal(pickPrize(0).id, SPIN_PRIZES[0].id);
  assert.equal(pickPrize(0.9999).id, SPIN_PRIZES.at(-1).id);
  const counts = {};
  for (let i = 0; i < 1000; i++) { const id = pickPrize(i / 1000).id; counts[id] = (counts[id] ?? 0) + 1; }
  assert.equal(counts.thb100, 350);
  assert.equal(counts.pct15, 10);
});

test("prize discounts respect caps and the minimum fare", () => {
  const pct10 = SPIN_PRIZES.find((p) => p.id === "pct10");
  assert.equal(spinDiscount(pct10, 2000), 200);
  assert.equal(spinDiscount(pct10, 9000), 500);
  assert.equal(spinDiscount(SPIN_PRIZES[0], 999), 0);
});

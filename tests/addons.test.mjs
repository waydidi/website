import assert from "node:assert/strict";
import test from "node:test";

const { addonsTotal } = await import("../lib/addons.ts");

test("add-ons: THB 300 per child seat, THB 200 exchange stop", () => {
  assert.equal(addonsTotal(0, false), 0);
  assert.equal(addonsTotal(2, false), 600);
  assert.equal(addonsTotal(1, true), 500);
  assert.equal(addonsTotal(0, true), 200);
});

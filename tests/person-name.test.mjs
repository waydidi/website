import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { fullName } = await vite.ssrLoadModule("/lib/person-name.ts");

test("the surname is not repeated when the first-name field already holds the full name", () => {
  assert.equal(fullName("Narubordee Naowarat", "Naowarat"), "Narubordee Naowarat");
  assert.equal(fullName("Narubordee", "Naowarat"), "Narubordee Naowarat");
  assert.equal(fullName("Mansi  Choksi", "choksi"), "Mansi Choksi");
  assert.equal(fullName("Anna", ""), "Anna");
  assert.equal(fullName(null, "Lee"), "Lee");
  // A different word that merely ends the same way is still added.
  assert.equal(fullName("Ann Smithson", "Son"), "Ann Smithson Son");
});

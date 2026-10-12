import assert from "node:assert/strict";
import { globSync } from "node:fs";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

// Structured data Google reads from the built pages.
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const paths = globSync(`${root}/dist/server/**/*.js`).sort((a, b) => a === `${root}/dist/server/index.js` ? -1 : b === `${root}/dist/server/index.js` ? 1 : 0);
const mf = new Miniflare({ modules: paths.map((path) => ({ type: "ESModule", path })), compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], assets: { directory: `${root}/dist/client`, routerConfig: { has_user_worker: true } } });
after(() => mf.dispose());

async function schemas(path) {
  const res = await mf.dispatchFetch("https://waydidi.com" + path);
  assert.equal(res.status, 200, path);
  const html = await res.text();
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());
}
const types = (list) => list.map((s) => s["@type"]);

test("every page says who Waydidi is, with logo and support contact", async () => {
  for (const path of ["/", "/blog", "/terms", "/destinations/phuket"]) {
    const org = (await schemas(path)).find((s) => s["@type"] === "Organization");
    assert.ok(org, path);
    assert.equal(org["@id"], "https://waydidi.com/#organization");
    assert.equal(org.logo.url, "https://waydidi.com/waydidi-logo.png");
    assert.equal(org.contactPoint[0].email, "support@waydidi.com");
  }
});

test("the transfer service is described on the homepage, not on blog or legal pages", async () => {
  assert.ok(types(await schemas("/")).includes("Service"));
  assert.ok(!types(await schemas("/blog")).includes("Service"));
  assert.ok(!types(await schemas("/terms")).includes("Service"));
  assert.ok(types(await schemas("/destinations/phuket")).includes("TaxiService"));
});

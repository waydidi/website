import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { Miniflare } from "miniflare";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const paths = globSync(`${root}/dist/server/**/*.js`).sort((a, b) => a === `${root}/dist/server/index.js` ? -1 : b === `${root}/dist/server/index.js` ? 1 : 0);
const mf = new Miniflare({ modules: paths.map((path) => ({ type: "ESModule", path })), compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], assets: { directory: `${root}/dist/client`, routerConfig: { has_user_worker: true } } });
after(() => mf.dispose());

const origin = "https://waydidi.com";

test("the production hostname serves canonical metadata without a blanket noindex header", async () => {
  const response = await mf.dispatchFetch(origin + "/");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Robots-Tag"), null);
  const html = await response.text();
  assert.ok(html.includes('rel="canonical" href="' + origin + '"'));
  assert.ok(html.includes(origin));
  assert.doesNotMatch(html, /waydidi-private-transfer\.dankbangkok\.chatgpt\.site/);
});

test("other workers.dev hosts remain excluded from indexing", async () => {
  const response = await mf.dispatchFetch("https://preview.example.workers.dev/");
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  await response.text();
});

test("robots points search engines to the only live sitemap", async () => {
  const response = await mf.dispatchFetch(origin + "/robots.txt");
  assert.equal(response.status, 200);
  const robots = await response.text();
  assert.ok(robots.includes("Sitemap: " + origin + "/sitemap.xml"));
  assert.ok(robots.includes("Disallow: /admin/"));
});

test("alternate hostnames send page visits to waydidi.com, but keep API calls working", async () => {
  for (const host of ["https://www.waydidi.com", "https://waydidi-website.contact-waydidi.workers.dev"]) {
    const page = await mf.dispatchFetch(host + "/help?x=1", { redirect: "manual" });
    assert.equal(page.status, 301);
    assert.equal(page.headers.get("Location"), origin + "/help?x=1");
    await page.text();
  }
  const api = await mf.dispatchFetch("https://waydidi-website.contact-waydidi.workers.dev/api/chat", { redirect: "manual" });
  assert.notEqual(api.status, 301);
  await api.text();
});

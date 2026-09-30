import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { Miniflare } from "miniflare";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const paths = globSync(`${root}/dist/server/**/*.js`).sort((a, b) => a === `${root}/dist/server/index.js` ? -1 : b === `${root}/dist/server/index.js` ? 1 : 0);
const mf = new Miniflare({ modules: paths.map((path) => ({ type: "ESModule", path })), compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], assets: { directory: `${root}/dist/client`, routerConfig: { has_user_worker: true } } });
after(() => mf.dispose());

test("production homepage links a same-origin manifest and Apple installation metadata", async () => {
  const response = await mf.dispatchFetch("https://waydidi.example/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /name="theme-color" content="#FE8B05"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /Install Waydidi/);
});

test("production worker and manifest have revalidation headers and correct MIME types", async () => {
  for (const [path, type] of [["/sw.js", "application/javascript"], ["/manifest.webmanifest", "application/manifest+json"]]) {
    const response = await mf.dispatchFetch(`https://waydidi.example${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("Content-Type"), new RegExp(type.replace("+", "\\+")));
    assert.match(response.headers.get("Cache-Control"), /no-cache/);
  }
});

test("production precache resources resolve successfully including HTML redirects", async () => {
  for (const path of ["/offline.html", "/pwa/icon-192.png", "/pwa/icon-512.png"]) {
    let response = await mf.dispatchFetch(`https://waydidi.example${path}`);
    if ([301, 302, 307, 308].includes(response.status)) response = await mf.dispatchFetch(new URL(response.headers.get("Location"), `https://waydidi.example${path}`));
    assert.equal(response.status, 200, path);
    if (path === "/offline.html") {
      const html = await response.text();
      assert.match(html, /tel:\+66632064884/);
      assert.match(html, /No booking or payment has been submitted/);
    }
  }
});

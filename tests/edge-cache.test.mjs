import assert from "node:assert/strict";
import { globSync } from "node:fs";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
const { edgeTtl, mayFillEdgeCache } = await vite.ssrLoadModule("/lib/edge-cache.ts");
const { destinations, publicPages } = await vite.ssrLoadModule("/lib/public-content.ts");
const ttl = (path) => edgeTtl(new URL("https://waydidi.com" + path));

test("public marketing pages are cached; tour packages refresh sooner", () => {
  for (const path of ["/", "/destinations", "/drivers", "/agencies", "/partners", "/refund-policy", ...publicPages.map((p) => `/${p.slug}`), ...destinations.map((d) => `/destinations/${d.slug}`)])
    assert.equal(ttl(path), 300, path);
  assert.equal(ttl("/trips/bangkok-temples"), 120);
  assert.equal(ttl("/blog/some-post"), 300);
  assert.equal(ttl("/blog/some-post?preview=1"), 0);
});

test("personal, signed-in and live pages are never cached", () => {
  for (const path of ["/help", "/account", "/account/trips", "/booking/manage", "/trip/ABC", "/pay/ABC", "/liff", "/liff/trips", "/admin", "/driver", "/flights", "/api/account/session", "/destinations/phuket/extra", "/index.rsc", "/destinations.rsc"])
    assert.equal(ttl(path), 0, path);
});

test("only signed-out requests fill the cache", () => {
  const req = (cookie) => new Request("https://waydidi.com/", { headers: cookie ? { cookie } : {} });
  assert.equal(mayFillEdgeCache(req()), true);
  assert.equal(mayFillEdgeCache(req("waydidi-lang=th; wd_ref=mint")), true);
  assert.equal(mayFillEdgeCache(req("waydidi-lang=th; waydidi_account=abc")), false);
  assert.equal(mayFillEdgeCache(req("waydidi_admin_session=xyz")), false);
  assert.equal(mayFillEdgeCache(req("waydidi_account=")), true, "an empty (signed-out) cookie is not a session");
});

// The built Worker: a signed-out visit fills the cache, the next visitor gets the cached page.
const paths = globSync(`${root}/dist/server/**/*.js`).sort((a, b) => a === `${root}/dist/server/index.js` ? -1 : b === `${root}/dist/server/index.js` ? 1 : 0);
const mf = new Miniflare({ modules: paths.map((path) => ({ type: "ESModule", path })), compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], assets: { directory: `${root}/dist/client`, routerConfig: { has_user_worker: true } } });
after(async () => { await mf.dispose(); await vite.close(); });

test("the Worker serves a cached public page to the next visitor", async () => {
  const signedIn = await mf.dispatchFetch("https://waydidi.com/about", { headers: { cookie: "waydidi_account=someone" } });
  assert.equal(signedIn.status, 200);
  await signedIn.text();
  const first = await mf.dispatchFetch("https://waydidi.com/about");
  assert.equal(first.status, 200);
  assert.doesNotMatch(first.headers.get("cache-control") ?? "", /s-maxage/, "a signed-in visit does not fill the cache");
  await first.text();
  await new Promise((r) => setTimeout(r, 200));
  const second = await mf.dispatchFetch("https://waydidi.com/about");
  assert.match(second.headers.get("cache-control") ?? "", /s-maxage=300/);
  assert.ok(second.headers.get("content-security-policy"), "cached pages still get the security headers");
  await second.text();
});

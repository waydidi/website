import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync } from "node:fs";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

// Link previews (LINE, Facebook, WhatsApp): every public page names a 1200×630 JPEG.
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
const { destinations, publicPages } = await vite.ssrLoadModule("/lib/public-content.ts");
const paths = globSync(`${root}/dist/server/**/*.js`).sort((a, b) => a === `${root}/dist/server/index.js` ? -1 : b === `${root}/dist/server/index.js` ? 1 : 0);
const mf = new Miniflare({ modules: paths.map((path) => ({ type: "ESModule", path })), compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], assets: { directory: `${root}/dist/client`, routerConfig: { has_user_worker: true } } });
after(async () => { await mf.dispose(); await vite.close(); });

const jpegSize = (file) => {
  const b = readFileSync(file);
  assert.equal(b[0], 0xff); assert.equal(b[1], 0xd8);
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
};
async function ogImage(path) {
  const html = await (await mf.dispatchFetch("https://waydidi.com" + path)).text();
  return html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
}

test("share images are 1200×630 JPEGs, one for each destination", () => {
  assert.deepEqual(jpegSize(`${root}/public/og/waydidi.jpg`), [1200, 630]);
  for (const d of destinations.filter((x) => x.image)) {
    const file = `${root}/public/og/destinations/${d.slug}.jpg`;
    assert.ok(existsSync(file), `missing ${file}`);
    assert.deepEqual(jpegSize(file), [1200, 630], d.slug);
  }
});

test("every public page names a share image", async () => {
  for (const path of ["/", "/destinations", "/airport-transfer", "/blog", "/drivers", "/agencies", ...publicPages.map((p) => `/${p.slug}`)])
    assert.equal(await ogImage(path), "https://waydidi.com/og/waydidi.jpg", path);
  assert.equal(await ogImage("/destinations/phuket"), "https://waydidi.com/og/destinations/phuket.jpg");
});

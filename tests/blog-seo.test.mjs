import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { seoChecks, seoScore } = await vite.ssrLoadModule("/lib/blog-seo.ts");

const base = { title: "Bangkok to Hua Hin by private car", seoTitle: "", seoDescription: "", excerpt: "", slug: "bangkok-to-hua-hin", focusKeyword: "", blocks: [], featuredImage: null, hasRoute: false };
const status = (checks, id) => checks.find((c) => c.id === id)?.status;

test("asks for a focus keyword when none is set", () => {
  assert.equal(status(seoChecks(base), "kw"), "warn");
});

test("finds the focus keyword in title, intro and permalink", () => {
  const checks = seoChecks({ ...base, focusKeyword: "Bangkok to Hua Hin", blocks: [{ type: "paragraph", text: "The drive from **Bangkok to Hua Hin** takes about three hours." }] });
  assert.equal(status(checks, "kw-title"), "good");
  assert.equal(status(checks, "kw-intro"), "good");
  assert.equal(status(checks, "kw-slug"), "good");
  assert.equal(status(checks, "kw-description"), "warn");
});

test("counts internal links and missing alt text", () => {
  const checks = seoChecks({ ...base, blocks: [{ type: "paragraph", text: "See [Pattaya](/destinations/pattaya) and [this](https://example.com)." }, { type: "image", src: "/a.webp", alt: "" }] });
  assert.equal(status(checks, "internal-links"), "warn");
  assert.equal(status(checks, "alt"), "bad");
});

test("a complete guide scores higher than an empty one", () => {
  const long = Array.from({ length: 700 }, () => "word").join(" ");
  const full = seoChecks({ ...base, focusKeyword: "hua hin", seoDescription: "x".repeat(130), featuredImage: "/c.webp", hasRoute: true, blocks: [
    { type: "paragraph", text: `Hua Hin guide. ${long} [a](/blog/a) [b](/blog/b)` }, { type: "heading", text: "One" }, { type: "heading", text: "Two" }, { type: "heading", text: "Three" }, { type: "booking" }, { type: "faq", items: [{ q: "Q", a: "A" }] },
  ] });
  assert.ok(seoScore(full) > seoScore(seoChecks(base)));
  assert.ok(seoScore(full) >= 90);
});

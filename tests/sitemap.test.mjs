import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { sitemapEntries } = await vite.ssrLoadModule("/lib/sitemap-entries.ts");

const entries = sitemapEntries({
  siteUrl: "https://waydidi.com",
  pageSlugs: ["faq"],
  destinationSlugs: ["phuket"],
  posts: [
    { slug: "old", date: "2026-09-01", categories: ["Guides"] },
    { slug: "edited", date: "2026-09-10", updated: "2026-10-02", categories: ["Guides", "Phuket"] },
  ],
  packages: [{ slug: "bangkok-temples", updatedAt: "2026-10-05T08:00:00.000Z" }, { slug: "bad-date", updatedAt: "nope" }],
  categorySlug: (c) => c.toLowerCase(),
});
const byUrl = Object.fromEntries(entries.map((e) => [e.url.replace("https://waydidi.com", "") || "/", e]));
const iso = (d) => d?.toISOString().slice(0, 10);

test("published tour packages are listed with their real edit date", () => {
  assert.equal(iso(byUrl["/trips/bangkok-temples"].lastModified), "2026-10-05");
  assert.ok(byUrl["/trips/bad-date"]);
  assert.equal(byUrl["/trips/bad-date"].lastModified, undefined);
});

test("pages without a known edit date do not claim to change every day", () => {
  for (const path of ["/", "/help", "/faq", "/destinations/phuket", "/terms"]) assert.equal(byUrl[path].lastModified, undefined, path);
});

test("blog dates come from the posts", () => {
  assert.equal(iso(byUrl["/blog/old"].lastModified), "2026-09-01");
  assert.equal(iso(byUrl["/blog/edited"].lastModified), "2026-10-02");
  assert.equal(iso(byUrl["/blog"].lastModified), "2026-10-02");
  assert.equal(iso(byUrl["/blog/category/guides"].lastModified), "2026-10-02");
  assert.equal(iso(byUrl["/blog/category/phuket"].lastModified), "2026-10-02");
});

test("every URL is on the live origin and listed once", () => {
  assert.ok(entries.every((e) => e.url.startsWith("https://waydidi.com")));
  assert.equal(new Set(entries.map((e) => e.url)).size, entries.length);
});

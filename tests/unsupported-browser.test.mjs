import assert from "node:assert/strict";
import test, { after } from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const rules = await vite.ssrLoadModule("/lib/unsupported-browser.ts");
const html = await readFile(root + "/public/unsupported.html", "utf8");
const pageScript = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

// Runs the head script the way an old or a modern browser would see it.
function runHeadScript({ layers, pathname = "/terms", search = "", flag = null, storage = "works" }) {
  const replaced = [];
  const sandbox = {
    window: layers ? { CSSLayerBlockRule: function CSSLayerBlockRule() {} } : {},
    location: { pathname, search, replace: url => replaced.push(url) },
    sessionStorage: { getItem: () => { if (storage === "blocked") throw new Error("blocked"); return flag; } },
  };
  vm.runInNewContext(rules.UNSUPPORTED_BROWSER_SCRIPT, sandbox);
  return replaced;
}

// Runs the page script with a fake page; returns what the visitor would see.
function runPage({ search = "", storage = "works" }) {
  const stored = {};
  const link = { href: "/", style: {}, onclick: null };
  const sandbox = {
    location: { search },
    document: { getElementById: id => (id === "continue" ? link : null) },
    sessionStorage: { setItem: (key, value) => { if (storage === "blocked") throw new Error("blocked"); stored[key] = value; } },
  };
  vm.runInNewContext(pageScript, sandbox);
  return { link, stored };
}
const redirect = value => "?redirect=" + encodeURIComponent(value);

test("the check is on unless the owner switches it off", () => {
  assert.equal(rules.unsupportedBrowserCheckEnabled({}), true);
  assert.equal(rules.unsupportedBrowserCheckEnabled({ UNSUPPORTED_BROWSER_PAGE: "1" }), true);
  assert.equal(rules.unsupportedBrowserCheckEnabled({ UNSUPPORTED_BROWSER_PAGE: "0" }), false);
});

test("a browser without cascade layers is sent to the explanation page with the page it wanted", () => {
  assert.deepEqual(runHeadScript({ layers: false, pathname: "/terms", search: "?tab=1&x=a b" }), ["/unsupported.html?redirect=%2Fterms%3Ftab%3D1%26x%3Da%20b"]);
  assert.deepEqual(runHeadScript({ layers: false, pathname: "/", search: "" }), ["/unsupported.html?redirect=%2F"]);
});

test("modern browsers, the explanation page itself and visitors who chose to continue are left alone", () => {
  assert.deepEqual(runHeadScript({ layers: true }), []);
  assert.deepEqual(runHeadScript({ layers: false, pathname: "/unsupported.html" }), []);
  assert.deepEqual(runHeadScript({ layers: false, flag: "1" }), []);
  assert.deepEqual(runHeadScript({ layers: false, flag: "0" }).length, 1);
});

test("blocked session storage never breaks the page", () => {
  assert.equal(runHeadScript({ layers: false, storage: "blocked" }).length, 1);
  assert.doesNotThrow(() => vm.runInNewContext(rules.UNSUPPORTED_BROWSER_SCRIPT, {}));
});

test("the return link only ever points at a path on this site", () => {
  const good = [["/terms?tab=1", "/terms?tab=1"], ["/pay/WD-ABC123", "/pay/WD-ABC123"], ["/", "/"]];
  for (const [input, expected] of good) assert.equal(runPage({ search: redirect(input) }).link.href, expected, input);
  const bad = [
    "//evil.test", "//evil.test/path", "/\\evil.test", "https://evil.test", "http://evil.test/", "javascript:alert(1)",
    "data:text/html,x", "evil.test", "", "/\nevil", "/\t/evil.test", "/\u0000", "/unsupported.html?redirect=%2F", "/" + "a".repeat(300),
  ];
  for (const input of bad) assert.equal(runPage({ search: redirect(input) }).link.href, "/", JSON.stringify(input.slice(0, 40)));
  assert.equal(runPage({ search: "" }).link.href, "/");
  assert.equal(runPage({ search: "?redirect=%E0%A4%A" }).link.href, "/");
  assert.equal(runPage({ search: "?redirect=%2F%2Fevil.test&redirect=%2Fterms" }).link.href, "/");
});

test("choosing to continue is remembered only when the browser can remember it", () => {
  const { link, stored } = runPage({ search: redirect("/terms") });
  assert.equal(link.style.display, "block");
  assert.equal(stored["waydidi-old-browser-ok"], "0");
  link.onclick();
  assert.equal(stored["waydidi-old-browser-ok"], "1");
  const blocked = runPage({ search: redirect("/terms"), storage: "blocked" });
  assert.equal(blocked.link.style.display, undefined);
  assert.equal(blocked.link.onclick, null);
});

test("the page is self-contained, private, three languages and written in old JavaScript", () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  for (const lang of ["en", "th", "zh-Hans"]) assert.match(html, new RegExp(`<section lang="${lang}">`));
  assert.match(html, /tel:\+66632064884/);
  assert.match(html, /mailto:support@waydidi\.com/);
  assert.match(html, /No booking or payment has been submitted/);
  assert.doesNotMatch(html, /(src|href)="https?:/i, "no outside resources");
  assert.doesNotMatch(html, /@import|url\(/i);
  for (const modern of [/=>/, /\bconst\b/, /\blet\b/, /`/, /\?\./, /\?\?/, /\bclass\s+\w/, /\basync\b/, /\bawait\b/]) assert.doesNotMatch(pageScript, modern, String(modern));
  for (const modern of [/=>/, /\bconst\b/, /\blet\b/, /`/, /\?\./, /\?\?/]) assert.doesNotMatch(rules.UNSUPPORTED_BROWSER_SCRIPT, modern, String(modern));
});

test("the page is served without caching and kept out of search results", async () => {
  const headers = await readFile(root + "/public/_headers", "utf8");
  const block = /\/unsupported\.html\r?\n([ \t]+.+\r?\n?)+/.exec(headers)?.[0] ?? "";
  assert.match(block, /Cache-Control: no-cache/);
  assert.match(block, /X-Robots-Tag: noindex/);
});

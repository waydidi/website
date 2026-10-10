import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { tripLanguage } = await vite.ssrLoadModule("/lib/trip-language.ts");

test("the trip page follows ?lang=, then the site language, then the browser", () => {
  assert.equal(tripLanguage("ko", "th", "fr-FR,fr;q=0.9"), "ko");
  assert.equal(tripLanguage(undefined, "th", "fr-FR,fr;q=0.9"), "th");
  assert.equal(tripLanguage(undefined, undefined, "fr-FR,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(tripLanguage("xx", undefined, "de-CH"), "de");
});

test("browser languages are matched by preference and fall back to English", () => {
  assert.equal(tripLanguage(undefined, undefined, "ja-JP,ja;q=0.9,ru;q=0.8"), "ru");
  assert.equal(tripLanguage(undefined, undefined, "en;q=0.5,vi;q=0.9"), "vi");
  assert.equal(tripLanguage(undefined, undefined, "zh-CN"), "zh");
  assert.equal(tripLanguage(undefined, undefined, "tl-PH"), "fil");
  assert.equal(tripLanguage(undefined, undefined, "ja-JP"), "en");
  assert.equal(tripLanguage(undefined, undefined, null), "en");
});

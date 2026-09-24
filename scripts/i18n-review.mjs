#!/usr/bin/env node
// Lists translations still awaiting staff review, English beside each.
//   node scripts/i18n-review.mjs            all pending entries
//   node scripts/i18n-review.mjs th         one language
//   node scripts/i18n-review.mjs th legal.  one language, one namespace
// To approve an entry, set its "status" to "reviewed" in messages/<lang>.json.
// Entries under legal. and payment. stay English on the site until then.
import { readFileSync } from "node:fs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../messages/${name}.json`, import.meta.url), "utf8"));
const en = load("en");
const [onlyLocale, prefix = ""] = process.argv.slice(2);
const gated = (key) => key.startsWith("legal.") || key.startsWith("payment.");

let pending = 0;
for (const locale of ["th", "zh"]) {
  if (onlyLocale && onlyLocale !== locale) continue;
  const entries = Object.entries(load(locale)).filter(
    ([key, entry]) => entry.status !== "reviewed" && key.startsWith(prefix),
  );
  // Blocked wording first: it is what customers currently see in English.
  entries.sort(([a], [b]) => Number(gated(b)) - Number(gated(a)));
  console.log(`\n=== ${locale}: ${entries.length} awaiting review ===`);
  for (const [key, entry] of entries) {
    console.log(`\n${gated(key) ? "[BLOCKED UNTIL REVIEWED] " : ""}${key}`);
    console.log(`  en: ${en[key]}`);
    console.log(`  ${locale}: ${entry.text}`);
  }
  pending += entries.length;
}
console.log(`\n${pending} entries awaiting review.`);

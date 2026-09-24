import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../messages/${name}.json`, import.meta.url), "utf8"));

const en = load("en");
const translations = { th: load("th"), zh: load("zh") };
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

for (const [locale, messages] of Object.entries(translations)) {
  test(`${locale} translates every English key`, () => {
    const missing = Object.keys(en).filter((key) => !messages[key]?.text?.trim());
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(", ")}`);
  });

  test(`${locale} has no keys that English no longer uses`, () => {
    const stale = Object.keys(messages).filter((key) => !(key in en));
    assert.deepEqual(stale, [], `${locale} has stale keys: ${stale.join(", ")}`);
  });

  test(`${locale} marks every entry machine or reviewed`, () => {
    const invalid = Object.entries(messages)
      .filter(([, entry]) => entry.status !== "machine" && entry.status !== "reviewed")
      .map(([key]) => key);
    assert.deepEqual(invalid, [], `${locale} has invalid status on: ${invalid.join(", ")}`);
  });

  test(`${locale} keeps the same {placeholders} as English`, () => {
    const mismatched = Object.keys(en).filter(
      (key) =>
        messages[key] &&
        placeholders(messages[key].text).join() !== placeholders(en[key]).join(),
    );
    assert.deepEqual(mismatched, [], `${locale} placeholder mismatch: ${mismatched.join(", ")}`);
  });
}

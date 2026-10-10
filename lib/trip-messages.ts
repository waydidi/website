import en from "@/messages/en.json";
import { getMessages, locales, type Locale, type MessageKey, type Messages } from "@/lib/i18n";
import type { SiteLang } from "@/lib/site-languages";
import { cachedTranslations, translateMissing } from "@/lib/site-translate";

// The trip status page in every site language. English, Thai and Chinese use the hand-written
// messages; other languages get the page's fixed wording translated once by AI and cached
// (Admin → Translations). Only repository wording is sent: names, addresses and notes on a trip
// are never translated and stay exactly as written.

/** Message keys the trip page and its language and share sheets use. */
const TRIP_KEY = /^(trip\.|locale\.|nav\.home$)/;
const WAIT_MS = 9000;
// Recorded with each cached line so staff can see where it is used.
const SOURCE_PATH = "/trip-status";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

export async function tripMessages(lang: SiteLang): Promise<Messages> {
  if (locales.includes(lang as Locale)) return getMessages(lang as Locale);
  const messages = { ...en } as Messages;
  const keys = (Object.keys(en) as MessageKey[]).filter((k) => TRIP_KEY.test(k));
  const texts = [...new Set(keys.map((k) => en[k]))];
  let found = await cachedTranslations(lang, texts).catch(() => new Map<string, string>());
  const missing = texts.filter((t) => !found.has(t));
  if (missing.length) {
    // The first visitor in a new language waits for the translation (once); if it is slow,
    // the page shows English for the missing lines and the next visit has them.
    const more = await Promise.race([
      translateMissing(lang, missing, SOURCE_PATH).catch(() => new Map<string, string>()),
      new Promise<Map<string, string>>((r) => setTimeout(() => r(new Map()), WAIT_MS)),
    ]);
    found = new Map([...found, ...more]);
  }
  for (const key of keys) {
    const text = found.get(en[key]);
    // A translation that lost or changed a {placeholder} would show broken text: keep English.
    if (text && placeholders(text) === placeholders(en[key])) messages[key] = text;
  }
  return messages;
}

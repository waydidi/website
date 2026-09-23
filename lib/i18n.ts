import en from "@/messages/en.json";
import th from "@/messages/th.json";
import zh from "@/messages/zh.json";

export type Locale = "en" | "th" | "zh";
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

// "machine" until a staff member checks the wording, then "reviewed".
// JSON imports type this as a plain string; tests/i18n.test.mjs rejects any other value.
type TranslatedEntry = { text: string; status: string };

export const locales: Locale[] = ["en", "th", "zh"];

export const localeInfo: Record<Locale, { name: string; htmlLang: string; path: string }> = {
  en: { name: "English", htmlLang: "en", path: "/" },
  th: { name: "ไทย", htmlLang: "th", path: "/th" },
  zh: { name: "中文", htmlLang: "zh-Hans", path: "/zh" },
};

// Wording in these namespaces carries legal or payment consequences, such as
// what "free cancellation" promises. A machine translation of it never goes
// live: the English stands until staff mark the translation "reviewed".
const REVIEW_REQUIRED = ["legal.", "payment."];

const translations: Record<Exclude<Locale, "en">, Record<string, TranslatedEntry>> = { th, zh };

export function getMessages(locale: Locale): Messages {
  if (locale === "en") return en;
  const source = translations[locale];
  const messages = { ...en };
  for (const key of Object.keys(en) as MessageKey[]) {
    const entry = source[key];
    if (!entry?.text) continue;
    const gated = REVIEW_REQUIRED.some((prefix) => key.startsWith(prefix));
    if (gated && entry.status !== "reviewed") continue;
    messages[key] = entry.text;
  }
  return messages;
}

export function translate(
  messages: Messages,
  key: MessageKey,
  vars?: Record<string, string | number>,
) {
  const template = messages[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

// Month and weekday names in the visitor's language, always on the Christian
// calendar. Plain "th-TH" would switch to the Buddhist era.
export function intlLocale(locale: Locale) {
  return locale === "th" ? "th-TH-u-ca-gregory" : locale === "zh" ? "zh-Hans-CN" : "en-GB";
}

// Every displayed date is dd/mm/yyyy in the Christian era, in all languages.
// Takes the booking flow's own yyyy-mm-dd values, so no timezone shift applies.
export function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

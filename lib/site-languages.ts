// Languages the whole site can be shown in. English is the source; every other language is
// translated by AI (Haiku; cached and reviewable in Admin → Translations).

export type SiteLang = "en" | "th" | "zh" | "ko" | "fr" | "de" | "vi" | "ru" | "es" | "id" | "fil" | "hi";
export const SITE_LANGS: { code: SiteLang; label: string; english: string; flag: string; htmlLang: string }[] = [
  { code: "en", label: "English", english: "English", flag: "en", htmlLang: "en" },
  { code: "th", label: "ภาษาไทย", english: "Thai", flag: "th", htmlLang: "th" },
  { code: "zh", label: "简体中文", english: "Simplified Chinese", flag: "cn", htmlLang: "zh-Hans" },
  { code: "ko", label: "한국어", english: "Korean", flag: "kr", htmlLang: "ko" },
  { code: "fr", label: "Français", english: "French", flag: "fr", htmlLang: "fr" },
  { code: "de", label: "Deutsch", english: "German", flag: "de", htmlLang: "de" },
  { code: "vi", label: "Tiếng Việt", english: "Vietnamese", flag: "vn", htmlLang: "vi" },
  { code: "ru", label: "Русский", english: "Russian", flag: "ru", htmlLang: "ru" },
  { code: "es", label: "Español", english: "Spanish", flag: "es", htmlLang: "es" },
  { code: "id", label: "Bahasa Indonesia", english: "Indonesian", flag: "id", htmlLang: "id" },
  { code: "fil", label: "Filipino", english: "Filipino (Tagalog)", flag: "ph", htmlLang: "fil" },
  { code: "hi", label: "हिन्दी", english: "Hindi", flag: "in", htmlLang: "hi" },
];
export const isSiteLang = (v: unknown): v is SiteLang => SITE_LANGS.some((l) => l.code === v);
export const LANG_COOKIE = "waydidi-lang";

/**
 * Pages that are never machine-translated: staff and driver tools,
 * and pages showing a customer's own details (names, addresses, phone numbers must never be sent to
 * the AI or stored in the shared translation table).
 */
export const untranslatedPath = (path: string) => /^\/(admin|admin-setup|driver|drivers\/portal|account|trip|booking|checkout|pay|chat-pay|itinerary|f|s|agency|th|zh)(\/|$)/.test(path);
/** Legal pages: the translation is shown, with a note that the English text is the official one. */
export const legalPath = (path: string) => /^\/(terms|privacy|refund-policy)(\/|$)/.test(path);

/** How each language should sound: polite and natural for travellers. */
export const STYLE: Record<Exclude<SiteLang, "en">, string> = {
  th: "Polite, warm Thai for customers (use คุณ; no slang). Avoid ending every sentence with ค่ะ/ครับ in UI labels; use polite particles only in full sentences addressed to the customer, and prefer ค่ะ.",
  zh: "Simplified Chinese (Mainland), polite and clear (use 您 when addressing the customer).",
  ko: "Polite Korean (합니다/하세요 style; 존댓말).",
  fr: "French, formal 'vous'.",
  de: "German, formal 'Sie'.",
  vi: "Polite Vietnamese, address the customer as 'quý khách' in sentences and keep UI labels short.",
  ru: "Russian, polite 'Вы' (capitalised when addressing the customer).",
  es: "Neutral international Spanish, polite 'usted'.",
  id: "Indonesian, polite 'Anda'.",
  fil: "Filipino (Tagalog) as used on travel sites, polite (use 'po' and 'ninyo/kayo' in sentences addressed to the customer); common English travel terms may stay in English where Filipinos would use them.",
  hi: "Hindi in Devanagari, polite 'आप'; common English travel terms (e.g. booking, airport) may be transliterated as Indians use them.",
};

/** Inline <head> script: hides the English page briefly when a translation is coming (no flash). */
export const PRE_HIDE = `try{var m=document.cookie.match(/(?:^|; )waydidi-lang=([a-z]+)/);var p=location.pathname;if(m&&m[1]!=="en"&&!/^\\/(admin|admin-setup|driver|drivers\\/portal|account|trip|booking|checkout|pay|chat-pay|itinerary|f|s|agency|th|zh)(\\/|$)/.test(p)){document.documentElement.classList.add("wd-tx");setTimeout(function(){document.documentElement.classList.remove("wd-tx")},2500)}}catch(e){}`;

// ---- Shared by the page translator and Admin → Translations (page scan + cost estimate) ----

export const TX_SKIP = "script,style,noscript,code,pre,textarea,svg,[translate=no],.notranslate,[data-no-translate]";
export const TX_ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
/** A piece of page text worth translating (has letters; not a code like THB or a booking reference). */
export function usableText(s: string) {
  const t = s.trim();
  return t.length > 0 && t.length <= 2000 && /\p{L}/u.test(t) && !/^[A-Z0-9][A-Z0-9 ._/-]{0,7}$/.test(t) ? t : null;
}
/** Every translatable text on a page (as the visitor's browser would translate it), without duplicates. */
export function pageTexts(doc: Document) {
  const out = new Set<string>();
  const add = (v: string | null) => { const t = v && usableText(v); if (t) out.add(t); };
  add(doc.title);
  const walk = (el: Element) => {
    if (el.matches(TX_SKIP)) return;
    for (const a of TX_ATTRS) add(el.getAttribute(a));
    for (const n of Array.from(el.childNodes)) { if (n.nodeType === 3) add(n.nodeValue); else if (n.nodeType === 1) walk(n as Element); }
  };
  if (doc.body) walk(doc.body);
  return [...out];
}

/** Translation model and its price (US$ per million tokens). */
export const TX_MODEL = { id: "claude-haiku-4-5", name: "Haiku 4.5", inUsd: 1, outUsd: 5 };
// Rough tokens per character of output: scripts like Thai and Hindi take more tokens.
const OUT_RATE: Partial<Record<SiteLang, number>> = { th: 0.9, hi: 0.9, ko: 0.6, zh: 0.7, ru: 0.45, vi: 0.45 };
/** Estimated US$ to translate these English texts into one language (batches of 60 with a ~900-token instruction). */
export function estimateCost(texts: string[], lang: SiteLang) {
  if (!texts.length) return 0;
  const chars = texts.reduce((n, t) => n + t.length + 4, 0);
  const batches = Math.ceil(texts.length / 60);
  const inTokens = batches * 900 + chars / 3.5;
  const outTokens = chars * (OUT_RATE[lang] ?? 0.35) + texts.length * 3;
  return (inTokens * TX_MODEL.inUsd + outTokens * TX_MODEL.outUsd) / 1e6;
}

// Languages the whole site can be shown in. English is the source; every other language is
// translated by AI (cached and reviewable in Admin → Translations). Thai and Chinese homepages
// also have hand-checked versions at /th and /zh.

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

/** Pages that are never machine-translated: staff and driver tools, and the hand-translated homepages. */
export const untranslatedPath = (path: string) => /^\/(admin|admin-setup|driver|drivers\/portal|th|zh)(\/|$)/.test(path);
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
export const PRE_HIDE = `try{var m=document.cookie.match(/(?:^|; )waydidi-lang=([a-z]+)/);var p=location.pathname;if(m&&m[1]!=="en"&&!/^\\/(admin|admin-setup|driver|drivers\\/portal|th|zh)(\\/|$)/.test(p)){document.documentElement.classList.add("wd-tx");setTimeout(function(){document.documentElement.classList.remove("wd-tx")},2500)}}catch(e){}`;

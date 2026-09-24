"use client";

import { Globe, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

type Language = { code: string; label: string; flag?: string; badge?: string; globe?: boolean };

// Flags are the square SVGs from flag-icons (MIT), copied to /public/flags.
export const LANGUAGES: Language[] = [
  { code: "en-TH", label: "English (Thailand)", flag: "th" },
  { code: "zh-TW", label: "繁體中文", badge: "繁" },
  { code: "ja", label: "日本語", flag: "jp" },
  { code: "ko", label: "한국어", flag: "kr" },
  { code: "th", label: "ภาษาไทย", flag: "th" },
  { code: "uk", label: "Українська", flag: "ua" },
  { code: "ar", label: "العربية", globe: true },
  { code: "id", label: "Bahasa Indonesia", flag: "id" },
  { code: "ms", label: "Bahasa Melayu", flag: "my" },
  { code: "da", label: "Dansk", flag: "dk" },
  { code: "de", label: "Deutsch", flag: "de" },
  { code: "en-GB", label: "English (United Kingdom)", flag: "gb" },
  { code: "en-US", label: "English (United States)", flag: "us" },
  { code: "es", label: "Español", flag: "es" },
  { code: "fr", label: "Français", flag: "fr" },
  { code: "it", label: "Italiano", flag: "it" },
  { code: "nl", label: "Nederlands", flag: "nl" },
  { code: "no", label: "Norsk", flag: "no" },
  { code: "pl", label: "Polski", flag: "pl" },
  { code: "pt", label: "Português", flag: "pt" },
  { code: "ru", label: "Русский", flag: "ru" },
  { code: "fi", label: "Suomi", flag: "fi" },
  { code: "sv", label: "Svenska", flag: "se" },
  { code: "vi", label: "Tiếng Việt", flag: "vn" },
  { code: "tr", label: "Türkçe", flag: "tr" },
  { code: "zh-CN", label: "简体中文", flag: "cn" },
];

export const CURRENCIES: [string, string][] = [
  ["THB", "Thai Baht"], ["AED", "United Arab Emirates Dirham"], ["AZN", "Azerbaijani Manat"], ["AUD", "Australian Dollar (AU$)"],
  ["BHD", "Bahraini Dinar"], ["BRL", "Brazilian Real"], ["BYN", "Belarusian Ruble"], ["CAD", "Canadian Dollar"], ["CHF", "Swiss Franc"],
  ["CLP", "Chilean Peso"], ["CNY", "Chinese Yuan"], ["CZK", "Czech Koruna"], ["DKK", "Danish Krone"], ["EUR", "Euro (€)"],
  ["GBP", "British Pound (£)"], ["HKD", "Hong Kong Dollar"], ["IDR", "Indonesian Rupiah"], ["INR", "Indian Rupee"], ["JPY", "Japanese Yen"],
  ["KRW", "South Korean Won"], ["KWD", "Kuwaiti Dinar"], ["MYR", "Malaysian Ringgit"], ["NOK", "Norwegian Krone"], ["NZD", "New Zealand Dollar"],
  ["PHP", "Philippine Peso"], ["PLN", "Polish Zloty"], ["QAR", "Qatari Riyal"], ["RUB", "Russian Ruble"], ["SAR", "Saudi Riyal"],
  ["SEK", "Swedish Krona"], ["SGD", "Singapore Dollar"], ["TRY", "Turkish Lira"], ["TWD", "New Taiwan Dollar"], ["UAH", "Ukrainian Hryvnia"],
  ["USD", "US Dollar ($)"], ["VND", "Vietnamese Dong"], ["ZAR", "South African Rand"],
];
const TOP_CURRENCIES = ["THB"];

const COOKIE = "waydidi_prefs";
const DEFAULTS = { language: "en-TH", currency: "THB" };

function readPrefs() {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const parsed = raw ? (JSON.parse(decodeURIComponent(raw)) as Partial<typeof DEFAULTS>) : {};
    return {
      language: LANGUAGES.some((l) => l.code === parsed.language) ? parsed.language! : DEFAULTS.language,
      currency: CURRENCIES.some(([c]) => c === parsed.currency) ? parsed.currency! : DEFAULTS.currency,
    };
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: typeof DEFAULTS) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(prefs))}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function LanguageIcon({ language, size = 40 }: { language: Language; size?: number }) {
  const style = { width: size, height: size };
  if (language.flag) return <img src={`/flags/${language.flag}.svg`} alt="" style={style} className="shrink-0 rounded-full object-cover ring-1 ring-black/10" />;
  if (language.globe) return <span style={style} className="grid shrink-0 place-items-center rounded-full bg-[#3264FF] text-white"><Globe size={size * 0.6} /></span>;
  return <span style={style} className="grid shrink-0 place-items-center rounded-full bg-white text-[18px] text-[#0F294D] ring-1 ring-slate-200">{language.badge}</span>;
}

export function LocalePicker({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"languages" | "currency">("languages");
  const [prefs, setPrefs] = useState(DEFAULTS);

  useEffect(() => {
    // The saved choice lives in a cookie, only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
  }, []);

  const language = LANGUAGES.find((l) => l.code === prefs.language) ?? LANGUAGES[0];
  function choose(next: Partial<typeof DEFAULTS>) {
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    savePrefs(updated);
    setOpen(false);
  }

  const row = (selected: boolean) => `flex w-full items-center gap-4 rounded-lg px-4 text-left text-[17px] transition ${selected ? "bg-[#F5F7FA] font-medium text-[#3264FF]" : "text-[#0F294D] hover:bg-[#F5F7FA]"}`;
  const tabClass = (active: boolean) => `relative pb-5 pt-1 text-[24px] leading-none transition sm:text-[28px] ${active ? "font-bold text-[#0F294D] after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-[#0F294D]" : "text-[#8592A6] hover:text-[#0F294D]"}`;

  return <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
    <DialogPrimitive.Trigger asChild>
      <button type="button" aria-label={`Language and currency: ${language.label}, ${prefs.currency}`} className={`flex items-center gap-2 rounded-full py-1 pl-0.5 pr-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}>
        <LanguageIcon language={language} size={26} />
        <span className="h-5 w-px bg-current opacity-40" aria-hidden />
        <span>{prefs.currency}</span>
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] flex-col rounded-t-[20px] bg-white text-[#0F294D] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
        <div className="flex items-end justify-between border-b border-[#EEF1F6] px-6 pt-8 sm:px-8">
          <div className="flex gap-10 sm:gap-20" role="tablist">
            <button role="tab" aria-selected={tab === "languages"} onClick={() => setTab("languages")} className={tabClass(tab === "languages")}>Languages</button>
            <button role="tab" aria-selected={tab === "currency"} onClick={() => setTab("currency")} className={tabClass(tab === "currency")}>Currency</button>
          </div>
          <DialogPrimitive.Close className="mb-5 grid size-9 place-items-center rounded-full text-[#0F294D] hover:bg-slate-100" aria-label="Close"><X size={30} strokeWidth={1.8} /></DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Title className="sr-only">{tab === "languages" ? "Choose a language" : "Choose a currency"}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">Your choice is remembered on this device.</DialogPrimitive.Description>
        <div className="flex-1 overflow-y-auto px-6 pb-10 pt-6 sm:px-8">
          {tab === "languages" ? <>
            <h3 className="mb-4 text-[22px] font-bold">All Languages</h3>
            <ul className="grid">{LANGUAGES.map((l) => <li key={l.code}><button onClick={() => choose({ language: l.code })} aria-current={l.code === prefs.language || undefined} className={`${row(l.code === prefs.language)} min-h-[96px] sm:min-h-[80px]`}><LanguageIcon language={l} />{l.label}</button></li>)}</ul>
          </> : <>
            <h3 className="mb-4 text-[22px] font-bold">Top currencies</h3>
            <ul className="grid">{CURRENCIES.filter(([c]) => TOP_CURRENCIES.includes(c)).map(([code, name]) => <li key={code}><button onClick={() => choose({ currency: code })} aria-current={code === prefs.currency || undefined} className={`${row(code === prefs.currency)} min-h-[80px] sm:min-h-[64px]`}><span><strong className="font-bold">{code}</strong> - {name}</span></button></li>)}</ul>
            <h3 className="mb-4 mt-10 text-[22px] font-bold">All currencies</h3>
            <ul className="grid">{CURRENCIES.map(([code, name]) => <li key={code}><button onClick={() => choose({ currency: code })} aria-current={code === prefs.currency || undefined} className={`${row(code === prefs.currency)} min-h-[80px] sm:min-h-[64px]`}><span><strong className="font-bold">{code}</strong> - {name}</span></button></li>)}</ul>
          </>}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

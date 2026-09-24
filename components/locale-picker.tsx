"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useI18n } from "@/components/i18n-provider";
import { localeInfo, type Locale } from "@/lib/i18n";

type Language = { code: Locale; label: string; flag: string };

// Only languages the site is actually translated into. Choosing one opens
// that language's homepage (see localeInfo in lib/i18n.ts). Flags are the
// square SVGs from flag-icons (MIT), copied to /public/flags.
export const LANGUAGES: Language[] = [
  { code: "en", label: "English (Thailand)", flag: "th" },
  { code: "th", label: "ภาษาไทย", flag: "th" },
  { code: "zh", label: "简体中文", flag: "cn" },
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

const CURRENCY_COOKIE = "waydidi_currency";
// Shared with the rest of the i18n code so untranslated pages can follow later.
const LOCALE_COOKIE = "waydidi-lang";

function readCurrency() {
  try {
    const value = document.cookie.split("; ").find((c) => c.startsWith(`${CURRENCY_COOKIE}=`))?.slice(CURRENCY_COOKIE.length + 1);
    return CURRENCIES.some(([code]) => code === value) ? value! : "THB";
  } catch {
    return "THB";
  }
}

function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function LanguageIcon({ language, size = 40 }: { language: Language; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG; next/image adds nothing here
  return <img src={`/flags/${language.flag}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover ring-1 ring-black/10" />;
}

export function LocalePicker({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"languages" | "currency">("languages");
  const [currency, setCurrency] = useState("THB");
  const { locale, t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    // The saved currency lives in a cookie, only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrency(readCurrency());
  }, []);

  const language = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  function chooseLanguage(code: Locale) {
    remember(LOCALE_COOKIE, code);
    setOpen(false);
    // Any unfinished booking is kept in sessionStorage and restored there.
    if (code !== locale) router.push(localeInfo[code].path);
  }
  function chooseCurrency(code: string) {
    remember(CURRENCY_COOKIE, code);
    setCurrency(code);
    setOpen(false);
  }

  const row = (selected: boolean) => `flex w-full items-center gap-4 rounded-lg px-4 text-left text-[17px] transition ${selected ? "bg-[#F5F7FA] font-medium text-[#3264FF]" : "text-[#0F294D] hover:bg-[#F5F7FA]"}`;
  const tabClass = (active: boolean) => `relative pb-5 pt-1 text-[24px] leading-none transition sm:text-[28px] ${active ? "font-bold text-[#0F294D] after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-[#0F294D]" : "text-[#8592A6] hover:text-[#0F294D]"}`;

  return <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
    <DialogPrimitive.Trigger asChild>
      <button type="button" aria-label={t("locale.button", { language: language.label, currency })} className={`flex items-center gap-2 rounded-full py-1 pl-0.5 pr-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}>
        <LanguageIcon language={language} size={26} />
        <span className="h-5 w-px bg-current opacity-40" aria-hidden />
        <span>{currency}</span>
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] flex-col rounded-t-[20px] bg-white text-[#0F294D] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
        <div className="flex items-end justify-between border-b border-[#EEF1F6] px-6 pt-8 sm:px-8">
          <div className="flex gap-10 sm:gap-20" role="tablist">
            <button role="tab" aria-selected={tab === "languages"} onClick={() => setTab("languages")} className={tabClass(tab === "languages")}>{t("locale.languages")}</button>
            <button role="tab" aria-selected={tab === "currency"} onClick={() => setTab("currency")} className={tabClass(tab === "currency")}>{t("locale.currency")}</button>
          </div>
          <DialogPrimitive.Close className="mb-5 grid size-9 place-items-center rounded-full text-[#0F294D] hover:bg-slate-100" aria-label={t("locale.close")}><X size={30} strokeWidth={1.8} /></DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Title className="sr-only">{tab === "languages" ? t("locale.languages") : t("locale.currency")}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{t("locale.remembered")}</DialogPrimitive.Description>
        <div className="flex-1 overflow-y-auto px-6 pb-10 pt-6 sm:px-8">
          {tab === "languages" ? <>
            <h3 className="mb-4 text-[22px] font-bold">{t("locale.allLanguages")}</h3>
            <ul className="grid">{LANGUAGES.map((l) => <li key={l.code}><button lang={localeInfo[l.code].htmlLang} onClick={() => chooseLanguage(l.code)} aria-current={l.code === locale || undefined} className={`${row(l.code === locale)} min-h-[96px] sm:min-h-[80px]`}><LanguageIcon language={l} />{l.label}</button></li>)}</ul>
          </> : <>
            <h3 className="mb-4 text-[22px] font-bold">{t("locale.topCurrencies")}</h3>
            <ul className="grid">{CURRENCIES.filter(([c]) => TOP_CURRENCIES.includes(c)).map(([code, name]) => <li key={code}><button onClick={() => chooseCurrency(code)} aria-current={code === currency || undefined} className={`${row(code === currency)} min-h-[80px] sm:min-h-[64px]`}><span><strong className="font-bold">{code}</strong> - {name}</span></button></li>)}</ul>
            <h3 className="mb-4 mt-10 text-[22px] font-bold">{t("locale.allCurrencies")}</h3>
            <ul className="grid">{CURRENCIES.map(([code, name]) => <li key={code}><button onClick={() => chooseCurrency(code)} aria-current={code === currency || undefined} className={`${row(code === currency)} min-h-[80px] sm:min-h-[64px]`}><span><strong className="font-bold">{code}</strong> - {name}</span></button></li>)}</ul>
          </>}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

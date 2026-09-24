"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useI18n } from "@/components/i18n-provider";
import { localeInfo, type Locale } from "@/lib/i18n";

type Language = { code: Locale; label: string; flag: string };

// Only languages the site is actually translated into. Choosing one opens
// that language's homepage (see localeInfo in lib/i18n.ts). Flags are the
// square SVGs from flag-icons (MIT), copied to /public/flags.
export const LANGUAGES: Language[] = [
  { code: "en", label: "English", flag: "en" },
  { code: "th", label: "ภาษาไทย", flag: "th" },
  { code: "zh", label: "简体中文", flag: "cn" },
];

export const CURRENCIES: [string, string][] = [
  ["THB", "Thai Baht"], ["USD", "US Dollar"], ["AUD", "Australian Dollar"], ["SGD", "Singapore Dollar"], ["CNY", "Chinese Yuan"],
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
  // Opened by tap/click (not keyboard): don't hand focus back to the button
  // on close, which would draw its focus ring on touch screens.
  const openedByPointer = useRef(false);
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
    window.dispatchEvent(new Event("waydidi:currency"));
    setOpen(false);
  }

  const row = (selected: boolean) => `flex w-full items-center gap-4 rounded-xl px-3 text-left text-base transition ${selected ? "bg-[#F5F7FA] font-medium text-[#3264FF]" : "text-[#0F294D] hover:bg-[#F5F7FA]"}`;
  const tabClass = (active: boolean) => `relative pb-4 text-lg leading-none transition ${active ? "font-bold text-[#0F294D] after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-[#0F294D]" : "text-[#8592A6] hover:text-[#0F294D]"}`;

  return <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
    <DialogPrimitive.Trigger asChild>
      <button type="button" onPointerDown={() => { openedByPointer.current = true; }} onKeyDown={() => { openedByPointer.current = false; }} aria-label={t("locale.button", { language: language.label, currency })} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-1 pl-0.5 pr-1 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}>
        <LanguageIcon language={language} size={25} />
        <span className="hidden h-5 w-px bg-current opacity-40 min-[300px]:block" aria-hidden />
        <span className="hidden min-[300px]:inline">{currency}</span>
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        // Focus the sheet itself on open rather than the first tab, so no
        // focus ring appears around "Languages" on touch devices.
        onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}
        onCloseAutoFocus={(event) => { if (openedByPointer.current) event.preventDefault(); }}
        className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] flex-col rounded-t-[20px] bg-white text-[#0F294D] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
        <div className="flex items-end justify-between border-b border-[#EEF1F6] px-6 pt-6 sm:px-8">
          <div className="flex gap-8" role="tablist">
            <button role="tab" aria-selected={tab === "languages"} onClick={() => setTab("languages")} className={tabClass(tab === "languages")}>{t("locale.languages")}</button>
            <button role="tab" aria-selected={tab === "currency"} onClick={() => setTab("currency")} className={tabClass(tab === "currency")}>{t("locale.currency")}</button>
          </div>
          <DialogPrimitive.Close className="mb-3 grid size-9 place-items-center rounded-full text-[#0F294D] hover:bg-slate-100" aria-label={t("locale.close")}><X size={24} strokeWidth={2} /></DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Title className="sr-only">{tab === "languages" ? t("locale.languages") : t("locale.currency")}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{t("locale.remembered")}</DialogPrimitive.Description>
        <div className="flex-1 overflow-y-auto px-6 pb-8 pt-5 sm:px-8">
          {tab === "languages" ? <>
            <h3 className="mb-2 text-base font-bold">{t("locale.allLanguages")}</h3>
            <ul className="grid">{LANGUAGES.map((l) => <li key={l.code}><button lang={localeInfo[l.code].htmlLang} onClick={() => chooseLanguage(l.code)} aria-current={l.code === locale || undefined} className={`${row(l.code === locale)} min-h-14`}><LanguageIcon language={l} size={32} />{l.label}</button></li>)}</ul>
          </> : <>
            <h3 className="mb-2 text-base font-bold">{t("locale.topCurrencies")}</h3>
            <ul className="grid">{CURRENCIES.filter(([c]) => TOP_CURRENCIES.includes(c)).map(([code, name]) => <li key={code}><button onClick={() => chooseCurrency(code)} aria-current={code === currency || undefined} className={`${row(code === currency)} min-h-12`}><span><strong className="font-bold">{code}</strong> - {name}</span></button></li>)}</ul>
            <h3 className="mb-2 mt-6 text-base font-bold">{t("locale.allCurrencies")}</h3>
            <ul className="grid">{CURRENCIES.map(([code, name]) => <li key={code}><button onClick={() => chooseCurrency(code)} aria-current={code === currency || undefined} className={`${row(code === currency)} min-h-12`}><span><strong className="font-bold">{code}</strong> - {name}</span></button></li>)}</ul>
          </>}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

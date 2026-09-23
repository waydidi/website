"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { localeInfo, locales, type Locale } from "@/lib/i18n";

const LOCALE_COOKIE = "waydidi-lang";

// Emoji flags render as bare letters on Windows, so the flags are drawn.
function Flag({ code, size = 22 }: { code: Locale; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {code === "en" && (
        <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className="size-full">
          <rect width="60" height="30" fill="#012169" />
          <path d="M0 0l60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
          <path d="M0 0l60 30M60 0L0 30" stroke="#C8102E" strokeWidth="2.4" />
          <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
          <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
        </svg>
      )}
      {code === "th" && (
        <svg viewBox="0 0 6 6" className="size-full">
          <rect width="6" height="6" fill="#A51931" />
          <rect y="1" width="6" height="4" fill="#F4F5F8" />
          <rect y="2" width="6" height="2" fill="#2D2A4A" />
        </svg>
      )}
      {code === "zh" && (
        <svg viewBox="0 0 30 30" className="size-full">
          <rect width="30" height="30" fill="#EE1C25" />
          <path
            fill="#FFFF00"
            d="M10 5.5l1.76 5.42h5.7l-4.61 3.35 1.76 5.42L10 16.34l-4.61 3.35 1.76-5.42-4.61-3.35h5.7z"
          />
          <circle cx="19" cy="7" r="1.1" fill="#FFFF00" />
          <circle cx="21.5" cy="10" r="1.1" fill="#FFFF00" />
          <circle cx="21.5" cy="14" r="1.1" fill="#FFFF00" />
          <circle cx="19" cy="17" r="1.1" fill="#FFFF00" />
        </svg>
      )}
    </span>
  );
}

// Remembered for pages that are not translated yet, so they can follow later.
function rememberLocale(code: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = { code: locale, ...localeInfo[locale] };
  const others = locales
    .filter((code) => code !== locale)
    .map((code) => ({ code, ...localeInfo[code] }));

  function choose(code: Locale) {
    rememberLocale(code);
    setOpen(false);
    // Any unfinished booking is kept in sessionStorage and restored there.
    router.push(localeInfo[code].path);
  }

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("lang.changeLabel", { name: current.name })}
        className={`flex items-center gap-2.5 rounded-full py-1 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 ${tone === "light" ? "text-ink focus-visible:ring-ink/60" : "text-ink focus-visible:ring-brand"}`}
      >
        <Flag code={current.code} />
        <span>
          {current.name} (<span className="underline underline-offset-2">{t("lang.change")}</span>)
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t("lang.choose")}
          className="absolute left-1/2 top-full z-50 mt-3 w-[180px] -translate-x-1/2 rounded-[3px] bg-white text-[15px] text-ink shadow-[0_6px_24px_rgb(0_0_0/0.18)]"
        >
          <span
            aria-hidden="true"
            className="absolute -top-[7px] left-1/2 size-3.5 -translate-x-1/2 rotate-45 bg-white"
          />
          {others.map((language, index) => (
            <button
              key={language.code}
              type="button"
              role="option"
              aria-selected={false}
              lang={language.htmlLang}
              onClick={() => choose(language.code)}
              className={`relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-orange-50 focus-visible:bg-orange-50 focus-visible:outline-none ${index > 0 ? "border-t border-slate-200" : ""}`}
            >
              <Flag code={language.code} size={24} />
              {language.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

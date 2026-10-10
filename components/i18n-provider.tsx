"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import en from "@/messages/en.json";
import {
  localeInfo,
  translate,
  type Locale,
  type MessageKey,
  type Messages,
} from "@/lib/i18n";

const I18nContext = createContext<{ locale: Locale; messages: Messages }>({
  locale: "en",
  messages: en,
});

export function I18nProvider({
  locale,
  messages,
  htmlLang,
  children,
}: {
  locale: Locale;
  messages: Messages;
  /** The page's language when it's shown in a language other than `locale` (AI-translated wording). */
  htmlLang?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    // The root layout is shared by every language, so the page corrects it.
    document.documentElement.lang = htmlLang ?? localeInfo[locale].htmlLang;
  }, [locale, htmlLang]);
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

// Outside a provider this falls back to English, so shared components keep
// working on pages that are not translated yet.
export function useI18n() {
  const { locale, messages } = useContext(I18nContext);
  return {
    locale,
    t: (key: MessageKey, vars?: Record<string, string | number>) => translate(messages, key, vars),
  };
}

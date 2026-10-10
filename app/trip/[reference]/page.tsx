import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { I18nProvider } from "@/components/i18n-provider";
import { TripView } from "@/components/trip/trip-view";
import { YourDay } from "@/components/itinerary/your-day";
import { tripByToken } from "@/lib/smart-trips";
import { tripWords } from "@/lib/trip-i18n";
import { locales, type Locale } from "@/lib/i18n";
import { LANG_COOKIE, SITE_LANGS } from "@/lib/site-languages";
import { tripLanguage } from "@/lib/trip-language";
import { tripMessages } from "@/lib/trip-messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your trip · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TripPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ lang?: string; day?: string }> }) {
  const [{ reference }, { lang: langParam, day }, cookieStore, requestHeaders] = await Promise.all([params, searchParams, cookies(), headers()]);
  // A smart trip's "Your day" panel, shown only when the itinerary link belongs to this booking.
  const smartTrip = day ? await tripByToken(day) : null;
  const showDay = smartTrip?.status === "accepted" && smartTrip.bookingReference === reference.toUpperCase();
  // Shown in the visitor's own language automatically (browser or site setting), or the one they pick.
  const lang = tripLanguage(langParam, cookieStore.get(LANG_COOKIE)?.value, requestHeaders.get("accept-language"));
  const locale: Locale = locales.includes(lang as Locale) ? (lang as Locale) : "en";
  const htmlLang = SITE_LANGS.find((l) => l.code === lang)!.htmlLang;
  return (
    <I18nProvider locale={locale} messages={await tripMessages(lang)} htmlLang={htmlLang}>
      {showDay && <div className="mx-auto max-w-[880px] px-4 pt-4"><YourDay token={day!} words={tripWords(smartTrip?.language)} /></div>}
      <TripView reference={reference.toUpperCase()} lang={lang} />
    </I18nProvider>
  );
}

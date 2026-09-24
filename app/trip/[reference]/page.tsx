import type { Metadata } from "next";
import { I18nProvider } from "@/components/i18n-provider";
import { TripView } from "@/components/trip/trip-view";
import { getMessages, locales, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your trip · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TripPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ reference }, { lang }] = await Promise.all([params, searchParams]);
  const locale: Locale = locales.includes(lang as Locale) ? (lang as Locale) : "en";
  return (
    <I18nProvider locale={locale} messages={getMessages(locale)}>
      <TripView reference={reference.toUpperCase()} />
    </I18nProvider>
  );
}

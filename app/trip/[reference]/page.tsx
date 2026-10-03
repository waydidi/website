import type { Metadata } from "next";
import { I18nProvider } from "@/components/i18n-provider";
import { TripView } from "@/components/trip/trip-view";
import { YourDay } from "@/components/itinerary/your-day";
import { tripByToken } from "@/lib/smart-trips";
import { getMessages, locales, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your trip · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TripPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ lang?: string; day?: string }> }) {
  const [{ reference }, { lang, day }] = await Promise.all([params, searchParams]);
  // A smart trip's "Your day" panel, shown only when the itinerary link belongs to this booking.
  const smartTrip = day ? await tripByToken(day) : null;
  const showDay = smartTrip?.status === "accepted" && smartTrip.bookingReference === reference.toUpperCase();
  const locale: Locale = locales.includes(lang as Locale) ? (lang as Locale) : "en";
  return (
    <I18nProvider locale={locale} messages={getMessages(locale)}>
      {showDay && <div className="mx-auto max-w-[880px] px-4 pt-4"><YourDay token={day!} /></div>}
      <TripView reference={reference.toUpperCase()} />
    </I18nProvider>
  );
}

import { ReviewBadges } from "@/components/home/review-badges";
import type { Metadata } from "next";
import { getMessages, localeInfo, type Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/public-content";
import { BookingFlow } from "./booking-flow";
import { ThailandDestinationMap } from "./destination-map";
import { WaydidiFooter } from "./footer";
import { ServiceCards } from "./service-cards";
import { Promotions } from "./promotions";

export function homeMetadata(locale: Locale): Metadata {
  const messages = getMessages(locale);
  const url = (code: Locale) => `${SITE_URL}${localeInfo[code].path === "/" ? "" : localeInfo[code].path}`;
  return {
    title: messages["meta.title"],
    description: messages["meta.description"],
    alternates: {
      canonical: url(locale),
      // Tells search engines the three homepages are translations of one page.
      languages: {
        en: url("en"),
        th: url("th"),
        "zh-Hans": url("zh"),
        "x-default": url("en"),
      },
    },
    openGraph: {
      title: messages["meta.title"],
      description: messages["meta.description"],
      url: url(locale),
      type: "website",
      locale: locale === "th" ? "th_TH" : locale === "zh" ? "zh_CN" : "en_TH",
    },
  };
}

// The booking flow is interactive and owns the page; the marketing sections
// below it render on the server and are handed in as children, so they ship
// as HTML rather than as part of the client bundle.
export function HomePage({ locale }: { locale: Locale }) {
  return (
    <BookingFlow locale={locale} messages={getMessages(locale)}>
      <ReviewBadges />
      <ServiceCards locale={locale} />
      <Promotions />
      <ThailandDestinationMap />
      <WaydidiFooter locale={locale} />
    </BookingFlow>
  );
}

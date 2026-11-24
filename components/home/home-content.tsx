import type { ReactNode } from "react";
import { TransferLinks } from "./transfer-links";
import { DestinationCards } from "./destination-cards";
import { HowItWorks } from "@/components/home/how-it-works";
import { HomeFaq } from "@/components/home/home-faq";
import { getMessages, type Locale } from "@/lib/i18n";
import { BookingFlow } from "./booking-flow";
import { multiCityEnabled } from "@/lib/multi-city-server";
import { ThailandDestinationMap } from "./destination-map";
const SHOW_MAP: boolean = false;
import { WaydidiFooter } from "./footer";
import { FleetSection } from "./fleet-section";
import { HomeTagline } from "./tagline";
import { TransferPartners } from "./transfer-partners";
import { DealsSection } from "./deals-section";

// The booking flow is interactive and owns the page; the marketing sections
// below it render on the server and are handed in as children, so they ship
// as HTML rather than as part of the client bundle. Shared by the homepage and
// the search results address (/reservation); homepage-only extras such as the
// "under development" notice come in as children.
export function HomeContent({ locale, children }: { locale: Locale; children?: ReactNode }) {
  const messages = getMessages(locale);
  return (
    <BookingFlow locale={locale} messages={messages} multiCity={multiCityEnabled()}>
      {children}
      <HomeTagline locale={locale} />
      <HowItWorks />
      {/* Hidden for now: "Where Waydidi takes you" map. */}
      {SHOW_MAP && <ThailandDestinationMap />}
      <DestinationCards />
      <FleetSection />
      <TransferPartners />
      <DealsSection />
      <HomeFaq />
      <TransferLinks />
      <WaydidiFooter locale={locale} />
    </BookingFlow>
  );
}

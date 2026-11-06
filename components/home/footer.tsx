import Link from "next/link";
import { env } from "cloudflare:workers";
import { WaydidiWordmark } from "@/components/waydidi-logo";
import { FooterLegal } from "@/components/footer-legal";
import { FooterLinkGroup as FooterLinks } from "@/components/footer-link-group";
import { getMessages, translate, type Locale, type MessageKey } from "@/lib/i18n";

export function WaydidiFooter({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  const t = (key: MessageKey) => translate(messages, key);
  return (
    <footer id="support" className="no-print mt-14 bg-brand text-white">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <div className="pt-12">
          <div className="grid sm:grid-cols-2 sm:gap-10 lg:grid-cols-[1.35fr_.8fr_.8fr_.8fr_.8fr]">
            <div className="mb-8 sm:mb-0">
              <Link
                href="/"
                className="inline-flex text-white"
                aria-label={t("nav.home")}
              >
                <WaydidiWordmark className="h-[40px] w-[156px]" />
              </Link>
            </div>
            <FooterLinks
              title={t("footer.ride")}
              links={[
                { label: t("nav.airportTransfer"), href: "/airport-transfer" },
                { label: t("nav.aToB"), href: "/a-to-b-transfer" },
                { label: t("nav.longJourney"), href: "/long-journeys" },
                { label: t("nav.checkBooking"), href: "/booking/manage" },
                ...((env as unknown as Record<string,unknown>).TRANSFER_ROUTE_PAGES === "1" ? [{label:t("transfers.all"),href:"/transfers"}] : []),
              ]}
            />
            <FooterLinks
              title={t("footer.trips")}
              links={[
                { label: t("nav.hourlyDriver"), href: "/hourly-driver" },
                { label: t("nav.pickupGuide"), href: "/airport-pickup-instructions" },
                { label: t("footer.checkFlights"), href: "/flights" },
                { label: t("footer.luggagePolicy"), href: "/luggage-policy" },
              ]}
            />
            <FooterLinks
              title={t("nav.destinations")}
              links={[
                { label: t("footer.ourDestinations"), href: "/destinations" },
              ]}
            />
            <FooterLinks
              title={t("footer.help")}
              links={[
                { label: t("footer.waydidiHelp"), href: "/help" },
                { label: t("footer.cancellationPolicy"), href: "/refund-policy" },
                { label: t("footer.contactUs"), href: "/contact" },
                { label: t("footer.safety"), href: "/safety-driver-standards" },
                { label: t("footer.travelAgencies"), href: "/agencies" },
                { label: t("footer.becomePartner"), href: "/partners" },
                { label: t("footer.drivers"), href: "/drivers" },
                // These two left the header menu to match Daytrip's; the footer keeps them one click away.
                { label: t("nav.blog"), href: "/blog" },
                { label: t("nav.about"), href: "/about" },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 border-t border-white/30 pt-8 text-sm sm:mt-16 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-semibold">
            <Link href="/help">{t("footer.helpCenter")}</Link>
            <Link href="/booking/manage">{t("footer.manageBooking")}</Link>
            <Link href="/contact">{t("footer.contactWaydidi")}</Link>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/terms">{t("footer.terms")}</Link>
            <Link href="/privacy">{t("footer.privacy")}</Link>
          </div>
        </div>
        <div className="pb-12"><FooterLegal /></div>
      </div>
    </footer>
  );
}


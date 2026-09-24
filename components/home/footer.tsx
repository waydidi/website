import Link from "next/link";
import { WaydidiWordmark } from "@/components/waydidi-logo";
import { destinations } from "@/lib/public-content";
import { FooterLegal } from "@/components/footer-legal";
import { getMessages, translate, type Locale, type MessageKey } from "@/lib/i18n";

export function WaydidiFooter({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  const t = (key: MessageKey) => translate(messages, key);
  return (
    <footer id="support" className="no-print mt-14 bg-[#FF8A05] text-white">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <div className="pt-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_.8fr_.8fr]">
            <div>
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
              ]}
            />
            <FooterLinks
              title={t("footer.trips")}
              links={[
                { label: t("nav.hourlyDriver"), href: "/hourly-driver" },
                { label: t("nav.pickupGuide"), href: "/airport-pickup-instructions" },
                { label: t("footer.luggagePolicy"), href: "/luggage-policy" },
              ]}
            />
            <FooterLinks
              title={t("nav.destinations")}
              links={[
                ...destinations.map((place) => ({ label: place.name, href: `/destinations/${place.slug}` })),
                { label: t("footer.allDestinations"), href: "/destinations" },
              ]}
            />
            <FooterLinks
              title={t("footer.help")}
              links={[
                { label: t("footer.waydidiHelp"), href: "/help" },
                { label: t("footer.cancellationPolicy"), href: "/cancellation-refund-policy" },
                { label: t("footer.contactUs"), href: "/contact" },
                { label: t("footer.safety"), href: "/safety-driver-standards" },
              ]}
            />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-5 border-t border-white/30 pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
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

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="font-black">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-white/90">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-white hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

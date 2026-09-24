import Link from "next/link";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { destinations } from "@/lib/public-content";
import { getMessages, translate, type Locale, type MessageKey } from "@/lib/i18n";

export function WaydidiFooter({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  const t = (key: MessageKey) => translate(messages, key);
  const paymentBadges = [
    "stripe",
    "VISA",
    "●●",
    "PromptPay",
    "Apple Pay",
    "G Pay",
  ];
  return (
    <footer id="support" className="no-print mt-14 bg-white text-ink">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <div className="border-t border-slate-200 pt-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_.8fr_.8fr]">
            <div>
              <Link
                href="/"
                className="inline-flex text-brand"
                aria-label={t("nav.home")}
              >
                <WaydidiLogo className="h-16 w-auto" />
              </Link>
              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">
                {t("footer.tagline")}
              </p>
              <h3 className="mt-8 font-black">{t("footer.payments")}</h3>
              <div className="mt-4 flex max-w-sm flex-wrap gap-2">
                {paymentBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`grid h-10 min-w-14 place-items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black ${badge === "stripe" ? "text-[#635BFF]" : badge === "VISA" ? "italic text-[#1434CB]" : badge === "●●" ? "tracking-[-.35em] text-[#EB001B]" : "text-slate-800"}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
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
                { label: t("footer.waydidiHelp"), href: "/faq" },
                { label: t("footer.cancellationPolicy"), href: "/cancellation-refund-policy" },
                { label: t("footer.contactUs"), href: "/contact" },
                { label: t("footer.safety"), href: "/safety-driver-standards" },
              ]}
            />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-5 border-t border-slate-200 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-semibold">
            <Link href="/faq">{t("footer.helpCenter")}</Link>
            <Link href="/booking/manage">{t("footer.manageBooking")}</Link>
            <Link href="/contact">{t("footer.contactWaydidi")}</Link>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/terms">{t("footer.terms")}</Link>
            <Link href="/privacy">{t("footer.privacy")}</Link>
          </div>
          <p className="text-slate-500">{t("footer.rights")}</p>
        </div>
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
      <ul className="mt-5 space-y-3 text-sm text-slate-600">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-brand-deep">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { AirportRide3D, DayTrip3D, ReserveCalendar3D, RideCar3D } from "@/components/icons/service-3d";
import { getMessages, translate, type Locale, type MessageKey } from "@/lib/i18n";

// The service cards under the hero, sized like Daytrip's first screen: a white panel with rounded top corners that
// overlaps the bottom of the hero, then three cards per row (two on tablets, one on phones). Titles reuse the menu's
// names, so only the short descriptions are new text. Each whole card is one link.
const CARDS: readonly { href: string; title: MessageKey; text: MessageKey; Icon: typeof RideCar3D }[] = [
  { href: "/a-to-b-transfer", title: "nav.aToB", text: "home.cards.aToB", Icon: RideCar3D },
  { href: "/airport-transfer", title: "nav.airportTransfer", text: "home.cards.airport", Icon: AirportRide3D },
  { href: "/hourly-driver", title: "nav.hourlyDriver", text: "home.cards.hourly", Icon: ReserveCalendar3D },
  { href: "/destinations", title: "nav.destinations", text: "home.cards.destinations", Icon: DayTrip3D },
  { href: "/long-journeys", title: "nav.longJourney", text: "home.cards.multiCity", Icon: RideCar3D },
  { href: "/airport-pickup-instructions", title: "nav.pickupGuide", text: "home.cards.pickupGuide", Icon: AirportRide3D },
];

export function ServiceCards({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  const t = (key: MessageKey) => translate(messages, key);
  return <section aria-label={t("home.cards.label")} className="relative z-10 -mt-8 rounded-t-[32px] bg-white pb-12 pt-8 md:pt-10">
    <ul className="mx-auto grid max-w-[1200px] gap-4 px-5 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map(({ href, title, text, Icon }) => <li key={href}>
        <Link href={href} className="group flex h-full min-h-[148px] items-stretch gap-4 rounded-2xl bg-[#F2F4F8] p-5 transition-colors hover:bg-[#E9EDF3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <h2 className="text-[18px] font-semibold leading-snug text-ink">{t(title)}</h2>
            <span className="mb-4 mt-1 block text-[14px]/[22px] text-slate-600">{t(text)}</span>
            <span className="mt-auto inline-flex h-9 items-center rounded-full bg-white px-4 text-[14px] font-semibold text-ink shadow-sm transition-colors group-hover:bg-orange-50">{t("home.cards.learnMore")}</span>
          </span>
          <Icon size={88} className="shrink-0 self-center" backdrop="#FFD9B0" />
        </Link>
      </li>)}
    </ul>
  </section>;
}

import Link from "next/link";
import { BadgeCheck, CarFront, Headphones, Luggage, MapPin, MessageCircle, Plane, ShieldCheck, UserRoundCheck } from "lucide-react";
import { HomeFaq } from "@/components/home/home-faq";
import { WHATSAPP, WHATSAPP_URL } from "@/lib/contact";
import { destinations, type Destination } from "@/lib/public-content";
import { TRANSFER_ROUTES, cityRoutes, transferBookingUrl, type PricedTransfer, type TransferPlace, type TransferRoute } from "@/lib/transfer-routes";

// The sections under a city page's hero, in the order Daytrip's city page uses: a trust strip, popular routes from and
// to the city, why-us points, a way to reach us, other destinations, link lists of every route, and the FAQ. The hero
// above them is not part of this file. Text and pictures are Waydidi's own; prices appear only when a route has a
// published price, and each card links to its route page when route pages are on, otherwise to the booking form.
const TRUST = [
  ["Private car, never shared", CarFront],
  ["Price shown before you book", BadgeCheck],
  ["Local drivers and support", Headphones],
] as const;

const FEATURES = [
  { title: "One private vehicle", text: "No shared shuttle and no strangers. The car is yours from pickup to drop-off.", Icon: CarFront },
  { title: "Price before you book", text: "See the total for your exact route and vehicle before you confirm.", Icon: BadgeCheck },
  { title: "Help when you need it", text: "Contact Waydidi with your booking reference before, during or after your ride.", Icon: Headphones },
  { title: "Local drivers", text: "Drivers who know the city, its traffic and the right entrance to your hotel.", Icon: UserRoundCheck },
  { title: "Room for your luggage", text: "Choose a vehicle by passengers and bags so everything fits.", Icon: Luggage },
  { title: "Safety standards", text: "Roadworthy vehicles, lawful driving and journey status checks on every ride.", Icon: ShieldCheck },
] as const;

// Every destination has a photo in /public/destinations. Some are not set as the destination's hero image in the data,
// so the cards look for the file by name; e2e/city-page-sections.spec.ts checks each one opens. The hero is not touched.
const PHOTO_SLUGS = new Set(["ayutthaya", "bangkok", "hua-hin", "kanchanaburi", "koh-chang", "koh-kood", "krabi", "pattaya", "phuket"]);
const photoFor = (place?: Destination) => place ? place.image ?? (PHOTO_SLUGS.has(place.slug) ? `/destinations/${place.slug}.webp` : undefined) : undefined;
const FIRST_ROUTES = 8;
const duration = (minutes: number) => minutes < 60 ? `${minutes}min` : minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes / 60}h`;
const baht = (minor: number) => `฿${(minor / 100).toLocaleString("en-US")}`;
const headingClass = "text-[26px] font-semibold leading-tight tracking-[-.02em] text-ink";

type RouteHref = (route: TransferRoute) => string;

function RouteCard({ route, other, href, from, here }: { route: TransferRoute; other: TransferPlace; href: string; from?: number; here: string }) {
  // The photo is the city at the other end. A trip inside this city (an airport to the centre) has no other city to show.
  const photo = other.destination === here ? undefined : photoFor(destinations.find((d) => d.slug === other.destination));
  const airport = /airport/i.test(route.from.name + route.to.name);
  const Icon = airport ? Plane : MapPin;
  return <li>
    <Link href={href} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-brand-tint">
        {photo
          // eslint-disable-next-line @next/next/no-img-element -- the Worker has no image optimizer; these are small local files
          ? <img src={photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          : <Icon size={40} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-text" />}
      </div>
      <h3 className="mt-3 text-[16px] font-semibold leading-snug text-ink">{route.from.name} to {route.to.name}</h3>
      <p className="mt-1 text-[14px] text-slate-600">{duration(route.durationMinutes)} · {Math.round(route.distanceMeters / 1000)} km</p>
      <p className="mt-1 text-[14px] font-semibold text-brand-deep">{from ? `From ${baht(from)}` : "Get a price"}</p>
    </Link>
  </li>;
}

function RouteSection({ title, routes, side, link, prices, here }: { title: string; routes: TransferRoute[]; side: "to" | "from"; link: RouteHref; prices: Map<string, number>; here: string }) {
  if (!routes.length) return null;
  const card = (route: TransferRoute) => <RouteCard key={route.slug} route={route} other={side === "to" ? route.to : route.from} href={link(route)} from={prices.get(route.slug)} here={here} />;
  const grid = "grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4";
  return <section className="mx-auto max-w-[1200px] px-5 py-10 md:py-12">
    <h2 className={headingClass}>{title}</h2>
    <p className="mt-2 text-[16px] leading-6 text-slate-600">Drive times are typical estimates. Your exact time and price are confirmed before you book.</p>
    <ul className={`mt-6 ${grid}`}>{routes.slice(0, FIRST_ROUTES).map(card)}</ul>
    {routes.length > FIRST_ROUTES ? <details className="group mt-6">
      <summary className="inline-flex h-11 cursor-pointer list-none items-center rounded-full bg-[#F2F4F8] px-5 text-[15px] font-semibold text-ink hover:bg-[#E9EDF3] group-open:hidden [&::-webkit-details-marker]:hidden">Show more</summary>
      <ul className={`mt-2 ${grid}`}>{routes.slice(FIRST_ROUTES).map(card)}</ul>
    </details> : null}
  </section>;
}

function PlaceCard({ place }: { place: Destination }) {
  return <li>
    <Link href={`/destinations/${place.slug}`} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
      <div className="relative aspect-square overflow-hidden rounded-[22px]" style={{ backgroundColor: place.color }}>
        {photoFor(place)
          // eslint-disable-next-line @next/next/no-img-element -- the Worker has no image optimizer; these are small local files
          ? <img src={photoFor(place)} alt={`${place.name}, Thailand`} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          : null}
      </div>
      <p className="mt-3 px-1 text-[16px] font-semibold text-ink">{place.name}</p>
      <p className="px-1 text-[13px] text-slate-500">{place.region}</p>
    </Link>
  </li>;
}

function RouteLinks({ title, routes, link }: { title: string; routes: TransferRoute[]; link: RouteHref }) {
  if (!routes.length) return null;
  return <section className="mx-auto max-w-[1200px] px-5 py-8">
    <h2 className="text-[20px] font-semibold tracking-[-.01em] text-ink">{title}</h2>
    <ul className="mt-4 columns-1 gap-8 text-[15px] sm:columns-2 lg:columns-3">
      {routes.map((route) => <li key={route.slug} className="break-inside-avoid py-1.5"><Link href={link(route)} className="text-slate-700 underline-offset-2 hover:text-brand-deep hover:underline">{route.from.name} to {route.to.name}</Link></li>)}
    </ul>
  </section>;
}

export function CitySections({ d, priced, routePages }: { d: Destination; priced: PricedTransfer[]; routePages: boolean }) {
  const { from, to } = cityRoutes(TRANSFER_ROUTES, d.slug);
  const prices = new Map(priced.map((route) => [route.slug, Math.min(...Object.values(route.pricesMinor))]));
  const link: RouteHref = (route) => routePages ? `/transfers/${route.slug}` : transferBookingUrl(route);
  const others = destinations.filter((place) => place.slug !== d.slug);
  return <>
    {/* Trust strip */}
    <section aria-label="Why book with Waydidi" className="border-b border-slate-200 bg-canvas">
      <ul className="mx-auto flex max-w-[1200px] flex-wrap gap-x-8 gap-y-3 px-5 py-4 text-[14px] font-semibold text-ink sm:text-[15px]">
        {TRUST.map(([text, Icon]) => <li key={text} className="flex items-center gap-2"><Icon size={18} className="text-brand-text" aria-hidden="true" />{text}</li>)}
      </ul>
    </section>

    <RouteSection title={`Popular routes from ${d.name}`} routes={from} side="to" link={link} prices={prices} here={d.slug} />
    <RouteSection title={`Popular routes to ${d.name}`} routes={to} side="from" link={link} prices={prices} here={d.slug} />

    {/* Why Waydidi */}
    <section aria-label="Why Waydidi" className="px-3 py-6 sm:px-5">
      <div className="mx-auto max-w-[1200px] rounded-[30px] bg-brand-tint px-5 py-12 sm:px-10">
        <h2 className="sr-only">Why book with Waydidi</h2>
        <ul className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ title, text, Icon }) => <li key={title}>
            <Icon className="text-brand-text" aria-hidden="true" />
            <h3 className="mt-3 text-[18px] font-semibold text-ink">{title}</h3>
            <p className="mt-1 text-[15px] leading-6 text-slate-700">{text}</p>
          </li>)}
        </ul>
      </div>
    </section>

    {/* Reach us (Daytrip shows its app here; Waydidi's quickest way to book and ask is WhatsApp) */}
    <section aria-label="Contact Waydidi" className="mx-auto max-w-[1200px] px-5 py-10">
      <div className="flex flex-col gap-5 rounded-[24px] bg-[#F2F4F8] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className={headingClass}>Go anywhere. Ask us on WhatsApp.</h2>
          <p className="mt-2 max-w-xl text-[16px] leading-6 text-slate-600">Message {WHATSAPP} with your route and date, and we will help you book.</p>
        </div>
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[16px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
          <MessageCircle size={20} aria-hidden="true" />Chat on WhatsApp
        </a>
      </div>
    </section>

    {/* Other destinations, grouped by region like Daytrip's regions */}
    <section aria-label="More of Thailand" className="mx-auto max-w-[1200px] px-5 py-10">
      <h2 className={headingClass}>Explore more of Thailand</h2>
      <p className="mt-2 text-[16px] leading-6 text-slate-600">Private transfers between Thailand&apos;s cities, airports and islands.</p>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{others.map((place) => <PlaceCard key={place.slug} place={place} />)}</ul>
    </section>

    <RouteLinks title={`All routes to ${d.name}`} routes={to} link={link} />
    <RouteLinks title={`All routes from ${d.name}`} routes={from} link={link} />

    <HomeFaq />
  </>;
}

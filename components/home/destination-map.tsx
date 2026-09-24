"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n";

export const thailandDotColumnsByRow = [
  [8,9],
  [6,7,8,9,10],
  [2,4,5,6,7,8,9],
  [2,3,4,5,6,7,8,9,10,11,12],
  [2,3,4,5,6,7,8,9,10,11,12],
  [1,2,3,4,5,6,7,8,9,10,11,12],
  [0,1,2,3,4,5,6,7,8,9,10,11],
  [1,2,3,4,5,6,7,8,9,10,11,15,18,19,20],
  [1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,19,20,21],
  [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,24],
  [5,6,7,8,9,10,11,12,13,14,15,16],
  [6,7,8,9,10,11,12,13,14,15,16],
  [6,7,8,11,12,13,14,15],
  [6,7,8,11,12,13,14,15],
  [6,7,8,11,12,13,14,15,16],
  [7,8,15,16],
  [7,8,15,17],
  [7,16,17],
  [7],
  [6],
  [5,6],
  [5],
  [4,5],
  [4,5,8],
  [4,5],
  [3,4,5,6,7],
  [3,4,5,6,7,8],
  [3,4,5,6,7,8,9],
  [4,5,6,7,8,9],
  [3,6,7,8,9],
  [5,6,7,8,9],
  [7,8,9,10],
  [8,9,10,11,12,13],
  [7,10,11,12,13],
  [12,13,14],
  [11,12,14],
] as const;

// The dot grid is a plain latitude/longitude grid of Thailand, 0.33° per dot:
// row 0 is Mae Sai (20.45°N), column 0 is 97.35°E, so
//   row = (20.45 - lat) / 0.33 and column = (lng - 97.35) / 0.33.
// Each marker sits on the grey dot nearest its real location (within one dot),
// nudged only where two markers would otherwise overlap on adjacent dots.
// tests/destination-map.test.mjs checks both rules.
export const MAP_ORIGIN = { lat: 20.45, lng: 97.35, degreesPerDot: 0.33 };

export const destinationMarkers = [
  { name: "Chiang Mai", row: 5, column: 5, lat: 18.79, lng: 98.98, kind: "long", slug: "chiang-mai", href: "/destinations", bookingValue: "Chiang Mai", route: "Bangkok → Chiang Mai", duration: "Around 9 hours", color: "#5b3d24", intro: "A long private journey north to Chiang Mai hotels, homes and meeting points." },
  { name: "Kanchanaburi", row: 19, column: 7, lat: 14.02, lng: 99.53, kind: "popular", slug: "kanchanaburi", href: "/destinations/kanchanaburi", bookingValue: "Kanchanaburi", route: "Bangkok → Kanchanaburi", duration: "Around 2.5 hours", color: "#574322", intro: "Private travel to the River Kwai area, riverside resorts and park gateways." },
  { name: "Ayutthaya", row: 18, column: 10, lat: 14.35, lng: 100.57, kind: "popular", slug: "ayutthaya", href: "/destinations/ayutthaya", bookingValue: "Ayutthaya", route: "Bangkok → Ayutthaya", duration: "Around 1.5 hours", color: "#6e3e24", intro: "A comfortable ride to Thailand's ancient capital, hotels and historic area." },
  { name: "Don Mueang Airport", row: 20, column: 10, lat: 13.91, lng: 100.61, kind: "airport", slug: "don-mueang-airport", href: "/airport-transfer", bookingValue: "Don Mueang International Airport (DMK)", route: "Don Mueang → Bangkok", duration: "Around 45–75 minutes", color: "#3b4656", intro: "Pre-booked airport pickup with clear passenger and meeting information." },
  { name: "Bangkok", row: 21, column: 9, lat: 13.75, lng: 100.5, kind: "popular", slug: "bangkok", href: "/destinations/bangkok", bookingValue: "Bangkok", route: "Bangkok private transfer", duration: "Door-to-door", color: "#40230f", intro: "Private connections between airports, hotels, homes and business districts." },
  { name: "Suvarnabhumi Airport", row: 21, column: 11, lat: 13.69, lng: 100.75, kind: "airport", slug: "suvarnabhumi-airport", href: "/airport-transfer", bookingValue: "Suvarnabhumi Airport (BKK)", route: "Suvarnabhumi → Bangkok", duration: "Around 45–90 minutes", color: "#26394f", intro: "A calm airport arrival with your pickup and destination confirmed in advance." },
  { name: "Pattaya", row: 23, column: 11, lat: 12.93, lng: 100.88, kind: "popular", slug: "pattaya", href: "/destinations/pattaya", bookingValue: "Pattaya", route: "Bangkok → Pattaya", duration: "Around 2 hours", color: "#153c72", intro: "Direct private transfers to Pattaya, Jomtien and Eastern Seaboard hotels." },
  { name: "Hua Hin", row: 24, column: 8, lat: 12.57, lng: 99.96, kind: "popular", slug: "hua-hin", href: "/destinations/hua-hin", bookingValue: "Hua Hin", route: "Bangkok → Hua Hin", duration: "Around 3 hours", color: "#7a4c1e", intro: "Travel directly to Hua Hin, Cha-am and nearby Gulf-side resorts." },
  { name: "Koh Chang", row: 25, column: 15, lat: 12.05, lng: 102.33, kind: "long", slug: "koh-chang", href: "/destinations/koh-chang", bookingValue: "Koh Chang", route: "Bangkok → Koh Chang", duration: "Around 6–7 hours", color: "#0d5c58", intro: "A ferry-aware road journey with resort delivery on Koh Chang." },
  { name: "Koh Kood", row: 27, column: 16, lat: 11.65, lng: 102.55, kind: "long", slug: "koh-kood", href: "/destinations/koh-kood", bookingValue: "Laem Sok Pier, Trat", route: "Bangkok → Koh Kood pier", duration: "Around 6 hours", color: "#14666f", intro: "Reach the correct Trat mainland pier in time for your Koh Kood boat." },
  { name: "Krabi", row: 37, column: 5, lat: 8.09, lng: 98.91, kind: "long", slug: "krabi", href: "/destinations/krabi", bookingValue: "Krabi", route: "Phuket → Krabi", duration: "Around 3 hours", color: "#345d36", intro: "Connect Krabi Airport, Ao Nang, Krabi Town and mainland piers." },
  { name: "Phuket", row: 39, column: 3, lat: 7.89, lng: 98.4, kind: "popular", slug: "phuket", href: "/destinations/phuket", bookingValue: "Phuket", route: "Phuket Airport → hotel", duration: "Around 45–90 minutes", color: "#0f4c4c", intro: "Private transfers from Phuket Airport to beaches, marinas and resorts." },
] as const;

type DestinationMarker = (typeof destinationMarkers)[number];

const destinationVisuals: Record<string, { image: string; position: string }> = {
  "chiang-mai": { image: "/hero-driver-customer.webp", position: "82% center" },
  kanchanaburi: { image: "/waydidi-transfer.png", position: "18% center" },
  ayutthaya: { image: "/hero-driver-customer.webp", position: "88% center" },
  "don-mueang-airport": { image: "/hero-driver-customer.webp", position: "70% center" },
  bangkok: { image: "/hero-driver-customer.webp", position: "92% center" },
  "suvarnabhumi-airport": { image: "/waydidi-transfer.png", position: "74% center" },
  pattaya: { image: "/waydidi-transfer.png", position: "42% center" },
  "hua-hin": { image: "/waydidi-transfer.png", position: "25% center" },
  "koh-chang": { image: "/waydidi-transfer.png", position: "58% center" },
  "koh-kood": { image: "/waydidi-transfer.png", position: "34% center" },
  krabi: { image: "/waydidi-transfer.png", position: "67% center" },
  phuket: { image: "/waydidi-transfer.png", position: "82% center" },
};

export function ThailandDestinationMap() {
  const { locale, t } = useI18n();
  const placeName = (slug: string) => t(`dest.${slug}` as MessageKey);
  const [activeSlug, setActiveSlug] = useState("bangkok");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const activeDestination = destinationMarkers.find((destination) => destination.slug === activeSlug) ?? destinationMarkers[4];
  const activeVisual = destinationVisuals[activeDestination.slug] ?? destinationVisuals.bangkok;

  return (
    <section
      aria-labelledby="destination-map-heading"
      className="overflow-hidden bg-white py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1180px] px-5 lg:px-10">
        <div className="grid items-start gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <div className="pt-1 lg:sticky lg:top-28">
            <h2
              id="destination-map-heading"
              className="max-w-[460px] text-[31px] font-bold leading-[1.05] tracking-[-.02em] text-ink sm:text-[48px]"
            >
              {t("map.heading")}
            </h2>
          </div>

          <div>
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[620px]" aria-label={t("map.label")}>
              <div className="absolute inset-[3%_6%_1%_4%]">
                <svg
                  className="h-full w-full overflow-visible"
                  viewBox="280 30 720 1230"
                  role="img"
                  aria-label={t("map.dotsLabel")}
                >
                  {thailandDotColumnsByRow.flatMap((columns, row) =>
                    columns.map((column) => (
                      <circle
                        key={`${row}-${column}`}
                        cx={318 + column * 26}
                        cy={58 + row * 26}
                        r="6.2"
                        fill="#737373"
                      />
                    )),
                  )}

                  {[...destinationMarkers]
                    .sort((a, b) => Number(a.slug === expandedSlug) - Number(b.slug === expandedSlug))
                    .map((destination, index) => {
                    const active = destination.slug === activeSlug;
                    const expanded = destination.slug === expandedSlug;
                    const cx = 318 + destination.column * 26;
                    const cy = 58 + destination.row * 26;
                    const labelWidth = Math.max(126, placeName(destination.slug).length * (locale === "zh" ? 22 : 13) + 48);

                    return (
                      <g
                        key={destination.slug}
                        role="button"
                        tabIndex={0}
                        aria-label={t("map.show", { name: placeName(destination.slug) })}
                        aria-pressed={active}
                        className="destination-map-marker cursor-pointer outline-none"
                        onClick={() => {
                          setActiveSlug(destination.slug);
                          setExpandedSlug(destination.slug);
                        }}
                        onMouseEnter={() => {
                          setActiveSlug(destination.slug);
                          setExpandedSlug(destination.slug);
                        }}
                        onMouseLeave={() => setExpandedSlug(null)}
                        onFocus={() => {
                          setActiveSlug(destination.slug);
                          setExpandedSlug(destination.slug);
                        }}
                        onBlur={() => setExpandedSlug(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveSlug(destination.slug);
                            setExpandedSlug(destination.slug);
                          }
                        }}
                      >
                        <circle
                          className="destination-marker-pulse"
                          cx={cx}
                          cy={cy}
                          r="19.5"
                          style={{ animationDelay: `${index * 140}ms` }}
                        />
                        <rect
                          x={cx - labelWidth}
                          y={cy - 25}
                          width={labelWidth + 24}
                          height="50"
                          rx="25"
                          className={`destination-marker-label ${expanded ? "destination-marker-label--open" : ""}`}
                          style={{ transformOrigin: `${cx}px ${cy}px` }}
                        />
                        <text
                          x={cx - labelWidth + 22}
                          y={cy + 7}
                          className={`destination-marker-name ${expanded ? "destination-marker-name--open" : ""}`}
                        >
                          {placeName(destination.slug)}
                        </text>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={active ? 18.2 : 15.6}
                          className={`destination-marker-dot ${expanded ? "destination-marker-dot--open" : ""}`}
                        />
                      </g>
                    );
                  })}
                </svg>

                <div className="pointer-events-none absolute bottom-[1%] right-[-3%] aspect-square w-[48%] sm:w-[44%]">
                  <div className="absolute left-[13%] top-[1%] size-[72%] overflow-hidden rounded-full border-[5px] border-white bg-slate-100 shadow-[0_16px_38px_rgba(33,23,38,.14)]">
                    <img
                      key={activeDestination.slug}
                      src={activeVisual.image}
                      alt=""
                      className="h-full w-full object-cover animate-in fade-in zoom-in-95 duration-500"
                      style={{ objectPosition: activeVisual.position }}
                    />
                    <div className="absolute inset-0 mix-blend-multiply opacity-10" style={{ backgroundColor: activeDestination.color }} />
                  </div>
                  <img
                    src="/vehicle-comfort-suv.webp"
                    alt={t("map.vehicleAlt")}
                    className="absolute bottom-0 left-0 z-10 w-full drop-shadow-[0_16px_12px_rgba(33,23,38,.18)]"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          <DestinationColumn
            title={t("map.cities")}
            items={destinationMarkers}
            color="#ff8a05"
            activeSlug={activeSlug}
            onSelect={setActiveSlug}
            onExpand={setExpandedSlug}
            onCollapse={() => setExpandedSlug(null)}
          />
        </div>
      </div>
    </section>
  );
}

function DestinationColumn({ title, items, color, ring = false, activeSlug, onSelect, onExpand, onCollapse }: { title: string; items: readonly DestinationMarker[]; color: string; ring?: boolean; activeSlug: string; onSelect: (slug: string) => void; onExpand: (slug: string) => void; onCollapse: () => void }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `destination-${title.toLowerCase().replace(/\s+/g, "-")}-panel`;

  const destinationItems = (className: string) => (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.slug}>
          <button
            type="button"
            onClick={() => {
              onSelect(item.slug);
              onExpand(item.slug);
            }}
            onMouseEnter={() => {
              onSelect(item.slug);
              onExpand(item.slug);
            }}
            onMouseLeave={onCollapse}
            onFocus={() => {
              onSelect(item.slug);
              onExpand(item.slug);
            }}
            onBlur={onCollapse}
            className={`px-2 py-1.5 text-left transition-colors focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand font-normal hover:font-bold hover:text-black focus-visible:font-bold ${activeSlug === item.slug ? "text-black" : ""}`}
          >
            {t(`dest.${item.slug}` as MessageKey)}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <div className="lg:hidden">
        <h3>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setIsOpen((open) => !open)}
            className="flex min-h-[46px] w-full items-center justify-between border-y border-[#a7adb6] py-3 text-left text-[13px] font-medium uppercase tracking-[.12em] text-ink transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            <span className="flex items-center gap-5">
              <span className={`size-[9px] rounded-full ${ring ? "border-2 border-brand" : ""}`} style={{ backgroundColor: color }} />
              {title}
            </span>
            <span className="relative block size-[13px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-[1.5px] w-[13px] -translate-y-1/2 rounded-full bg-ink" />
              <span className={`absolute left-1/2 top-0 h-[13px] w-[1.5px] -translate-x-1/2 rounded-full bg-ink transition-transform duration-300 ease-out ${isOpen ? "scale-y-0" : "scale-y-100"}`} />
            </span>
          </button>
        </h3>
        <div id={panelId} className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            {destinationItems("grid grid-cols-2 gap-x-5 gap-y-2.5 py-7 text-[15px] text-slate-600 sm:grid-cols-3 sm:py-8")}
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <h3 className="flex items-center gap-5 text-[13px] font-medium uppercase tracking-[.12em] text-ink">
          <span className={`size-[9px] rounded-full ${ring ? "border-2 border-brand" : ""}`} style={{ backgroundColor: color }} />
          {title}
        </h3>
        {destinationItems("mt-6 grid grid-cols-4 gap-x-5 gap-y-2.5 text-[15px] text-slate-600")}
      </div>
    </div>
  );
}

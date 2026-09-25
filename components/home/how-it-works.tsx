"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n";

// "How it works": three illustrated steps in a free horizontal scroll (no snapping).
function BookVisual() {
  // Screenshot of Waydidi's choose-car screen, shown as a phone screen.
  return <Image src="/how-it-works-book.webp" alt="Waydidi car choice screen: Suvarnabhumi Airport to Hilton Pattaya with Economy sedan THB 1,500 selected" width={600} height={1101} unoptimized className="absolute left-1/2 top-[4%] h-[92%] w-auto max-w-none -translate-x-1/2 rounded-[22px] border-4 border-white shadow-[0_14px_30px_rgba(0,0,0,.14)]" />;
}

const BOARD = [
  { flight: "TG921", city: "FRANKFURT", status: "LANDED" },
  { flight: "EK372", city: "DUBAI", status: "10:50" },
  { flight: "SQ706", city: "SINGAPORE", status: "11:05" },
];

function Flaps({ text, dim }: { text: string; dim?: boolean }) {
  return <span className="flex gap-[2px]">{[...text].map((c, i) => <span key={i} className={`grid h-[18px] w-[12px] place-items-center rounded-[2px] bg-[#1E1E1E] font-mono text-[10px] ${dim ? "text-white/45" : "text-white"}`}>{c === " " ? "" : c}</span>)}</span>;
}

function MeetVisual() {
  return <div className="relative w-[90%]">
    <div className="rounded-2xl bg-[#0E0E0E] p-3 shadow-[0_12px_30px_rgba(0,0,0,.25)]">
      <p className="flex justify-between text-[11px] text-white/60"><span>Arrivals</span><span>09:02</span></p>
      <ul className="mt-2 grid gap-1.5">
        {BOARD.map((row, i) => <li key={row.flight} className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5">
          <span className="flex gap-1.5"><Flaps text={row.flight} dim={i > 0} /><Flaps text={row.city.slice(0, 6)} dim={i > 0} /></span>
          <Flaps text={row.status} dim={i > 0} />
        </li>)}
      </ul>
    </div>
    <div className="relative mx-auto -mt-3 w-[72%] rotate-2 rounded-xl bg-white px-4 py-3 text-center shadow-[0_14px_28px_rgba(0,0,0,.14)]">
      <p className="text-[10px] font-bold tracking-wide text-brand">WAYDIDI</p>
      <p className="text-[24px] font-bold leading-tight text-[#1C1C1C]">M. Johnson</p>
      <p className="text-[10px] text-[#6B6B6B]">TG921 · Arrivals, Gate 3</p>
    </div>
  </div>;
}

// Route drawn on a simple street grid; the dot travels from the airport to the hotel.
const ROUTE = "M 60 175 L 60 135 L 140 135 L 140 75 L 235 75 L 235 45";

function RideVisual() {
  const streetsX = [20, 60, 100, 140, 180, 235, 280];
  const streetsY = [15, 45, 75, 105, 135, 175, 215, 255, 295];
  return <div className="absolute inset-0">
    <svg viewBox="0 0 300 330" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
      <rect width="300" height="330" fill="#F1F0EC" />
      {streetsX.map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="330" stroke="#E0DED8" strokeWidth={x === 60 || x === 140 ? 5 : 2} />)}
      {streetsY.map((y) => <line key={`h${y}`} x1="0" y1={y} x2="300" y2={y} stroke="#E0DED8" strokeWidth={y === 135 ? 5 : 2} />)}
      <path d={ROUTE} fill="none" stroke="#FF8A05" strokeOpacity=".18" strokeWidth="10" strokeLinejoin="round" />
      <path d={ROUTE} fill="none" stroke="#FF8A05" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="305" className="hiw-route">
        {/* Same clock as the car below, so the line grows right behind it from the airport to the hotel. */}
        <animate attributeName="stroke-dashoffset" values="305;0;0" keyTimes="0;.7;1" dur="4s" repeatCount="indefinite" />
      </path>
      <circle cx="235" cy="45" r="14" fill="#FF8A05" opacity=".18" className="hiw-pulse" />
      <circle cx="235" cy="45" r="7" fill="#FF8A05" />
      {/* Airport marker */}
      <circle cx="60" cy="190" r="13" fill="#1C1C1C" />
      <path d="M 60 181 l 2 7 l 7 3 l 0 2 l -7 -1 l -1 5 l 2 2 l 0 1.5 l -3 -1 l -3 1 l 0 -1.5 l 2 -2 l -1 -5 l -7 1 l 0 -2 l 7 -3 z" fill="#fff" />
      <circle r="6" fill="#fff" stroke="#1C1C1C" strokeWidth="3" className="hiw-car">
        <animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.7;1" calcMode="linear" path={ROUTE} />
      </circle>
    </svg>
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#F1F0EC] via-[#F1F0EC]/95 to-transparent px-5 pb-5 pt-10">
      <p className="text-[20px] font-bold text-[#1C1C1C]">Hilton Pattaya</p>
      <p className="text-[12px] text-[#6B6B6B]">1 h 27 min · 122 km</p>
    </div>
  </div>;
}

const VISUALS = [<BookVisual key="book" />, <MeetVisual key="meet" />, <RideVisual key="ride" />];

export function HowItWorks() {
  const { t } = useI18n();
  return <section aria-labelledby="how-heading" className="font-home bg-white py-10">
    <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
      <p className="text-[14px] font-semibold text-[#6B6B6B]">{t("how.eyebrow")}</p>
      <h2 id="how-heading" className="mt-1 text-[28px] font-bold leading-[1.1] tracking-[-.03em] text-[#1C1C1C]">{t("how.title")}</h2>
      <p className="mt-2 text-[15px] text-[#4A4A4A]">{t("how.subtitle")}</p>
    </div>
    {/* Free horizontal scroll: no snap, so cards stop wherever the swipe ends. */}
    <ol className="mx-auto mt-6 flex max-w-[1180px] gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:px-0 [&::-webkit-scrollbar]:hidden">
      {VISUALS.map((visual, i) => <li key={i} className="w-[82%] max-w-[340px] shrink-0">
        <div className="relative grid aspect-[10/11] place-items-center overflow-hidden rounded-3xl border border-[#E6E4DE] bg-gradient-to-b from-[#F6F5F2] to-[#EDECE8]">
          {visual}
        </div>
        <h3 className="mt-5 text-[20px] font-bold text-[#1C1C1C]"><span className="text-[#8A8A8A]">{i + 1}.</span> {t(`how.step${i + 1}.title` as MessageKey)}</h3>
        <p className="mt-1.5 text-[14px] leading-6 text-[#4A4A4A]">{t(`how.step${i + 1}.text` as MessageKey)}</p>
      </li>)}
    </ol>
  </section>;
}

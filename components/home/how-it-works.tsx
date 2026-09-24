"use client";

import Image from "next/image";
import { Luggage, Users } from "lucide-react";
import { useCurrency } from "@/components/use-currency";

// "How it works": three illustrated steps in a free horizontal scroll (no snapping).
const CARS = [
  { name: "Economy sedan", image: "/vehicle-economy-sedan.webp", people: 3, bags: 2, price: 1500 },
  { name: "Comfort BMW", image: "/vehicle-comfort-bmw.webp", people: 3, bags: 2, price: 2300 },
  { name: "Comfort SUV", image: "/vehicle-comfort-suv.webp", people: 4, bags: 4, price: 2600 },
];

function BookVisual() {
  const { money } = useCurrency();
  return <div className="w-[112%] shrink-0 origin-center scale-[.8] rounded-2xl border border-[#EEEEEE] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,.08)]">
    <div className="relative pl-5 text-[13px] font-semibold text-[#1C1C1C]">
      <span className="absolute left-0 top-[5px] size-2.5 rounded-full border-2 border-[#1C1C1C]" aria-hidden="true" />
      <span className="absolute left-[4px] top-[16px] h-[18px] w-px bg-[#BDBDBD]" aria-hidden="true" />
      <span className="absolute left-0 top-[36px] size-2.5 rounded-full bg-brand" aria-hidden="true" />
      <p>Suvarnabhumi Airport (BKK)</p>
      <p className="mt-3">Hilton Pattaya</p>
    </div>
    <p className="mt-2 flex items-center gap-1 text-[12px] text-[#6B6B6B]">Fri 25 Sep · 09:00 · <Users size={12} aria-hidden="true" /> 2</p>
    <hr className="my-3 border-[#EEEEEE]" />
    <ul className="grid gap-2">
      {CARS.map((car, i) => <li key={car.name} className={`flex items-center gap-2.5 rounded-xl border-2 px-2 py-1.5 ${i === 0 ? "border-brand" : "border-[#EEEEEE]"}`}>
        <span className="grid h-9 w-14 shrink-0 place-items-center rounded-lg bg-[#F6F6F6]"><Image src={car.image} alt="" width={112} height={72} unoptimized className="max-h-8 w-auto object-contain" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[#1C1C1C]">{car.name}</span>
          <span className="flex items-center gap-2 text-[11px] text-[#6B6B6B]"><span className="flex items-center gap-0.5"><Users size={11} aria-hidden="true" />{car.people}</span><span className="flex items-center gap-0.5"><Luggage size={11} aria-hidden="true" />{car.bags}</span></span>
        </span>
        <span className="whitespace-nowrap text-[13px] font-semibold text-[#1C1C1C]">{money(car.price)}</span>
      </li>)}
    </ul>
    <p className="mt-3 text-center text-[11px] text-[#6B6B6B]">Fixed price · Free cancellation up to 24h before</p>
  </div>;
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

const STEPS = [
  { title: "Book your ride", text: "Choose your route and car, add your details and get your booking confirmation straight away.", visual: <BookVisual /> },
  { title: "Meet your driver", text: "Find your driver at the meeting point with your name sign, and let them take care of your luggage.", visual: <MeetVisual /> },
  { title: "Enjoy your journey", text: "Settle in and enjoy a comfortable private ride, all the way to your destination.", visual: <RideVisual /> },
];

export function HowItWorks() {
  return <section aria-labelledby="how-heading" className="font-home bg-white py-10">
    <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
      <p className="text-[14px] font-semibold text-[#6B6B6B]">From booking to arrival</p>
      <h2 id="how-heading" className="mt-1 text-[28px] font-bold leading-[1.1] tracking-[-.03em] text-[#1C1C1C]">How it works</h2>
      <p className="mt-2 text-[15px] text-[#4A4A4A]">A few simple steps. A smoother journey.</p>
    </div>
    {/* Free horizontal scroll: no snap, so cards stop wherever the swipe ends. */}
    <ol className="mx-auto mt-6 flex max-w-[1180px] gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:px-0 [&::-webkit-scrollbar]:hidden">
      {STEPS.map((step, i) => <li key={step.title} className="w-[82%] max-w-[340px] shrink-0">
        <div className="relative grid aspect-[10/11] place-items-center overflow-hidden rounded-3xl border border-[#E6E4DE] bg-gradient-to-b from-[#F6F5F2] to-[#EDECE8]">
          {step.visual}
        </div>
        <h3 className="mt-5 text-[20px] font-bold text-[#1C1C1C]"><span className="text-[#8A8A8A]">{i + 1}.</span> {step.title}</h3>
        <p className="mt-1.5 text-[14px] leading-6 text-[#4A4A4A]">{step.text}</p>
      </li>)}
    </ol>
  </section>;
}

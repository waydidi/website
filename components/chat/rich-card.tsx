"use client";

import { CheckCircle2, Clock, Luggage, MapPin, Star, Users } from "lucide-react";
import { Fragment, useState } from "react";
import type { ChatCard } from "@/lib/chat-cards";

// LINE-style cards inside the website chat: car options with Book buttons, a booking summary with
// a Pay button, and the confirmation after payment.

// Same photos and class names as the homepage fleet.
const FLEET: Record<string, { label: string; models: string; image: string }> = {
  economy_sedan: { label: "Economy", models: "Toyota Corolla Altis or similar", image: "/vehicle-economy-sedan.webp" },
  comfort_bmw: { label: "Comfort BMW", models: "BMW 3 Series or similar", image: "/vehicle-comfort-bmw.webp" },
  comfort_suv: { label: "Comfort SUV", models: "Toyota Fortuner or similar", image: "/vehicle-comfort-suv.webp" },
  premium_minivan: { label: "Premium Minivan", models: "Toyota Commuter or similar", image: "/vehicle-premium-minivan.webp" },
};
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const shell = "w-[94%] max-w-[350px] overflow-hidden rounded-[18px] border border-slate-200 bg-white text-[#15161C] shadow-sm";

export function RichCard({ card, onShareLocation }: { card: ChatCard; onShareLocation?: (text: string) => void }) {
  if (card.type === "location") return <LocationAsk text={card.text} onShare={onShareLocation} />;
  if (card.type === "booking") {
    // Waydidi orange header; "Confirmed" in the same green as the "Best value" badge.
    const tone = card.status === "confirmed" || card.status === "completed" ? "bg-[#06C755] text-white" : card.status === "cancelled" ? "bg-white text-red-700" : "bg-white text-amber-800";
    return <div className={shell}>
      <div className="flex items-center justify-between gap-2 bg-[#FE8B05] px-4 py-3 text-white"><p className="text-[15px] font-bold">Booking {card.reference}</p><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${tone}`}>{card.statusText}</span></div>
      <dl className="grid gap-1.5 px-4 py-3 text-[13px]">
        {card.rows.map(([k, v]) => <Fragment key={k}>
          <div className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-medium">{v.endsWith("(Paid)") ? <>{v.slice(0, -6)}<span className="text-[#06C755]">(Paid)</span></> : v}</dd></div>
          {k === "Vehicle" && card.people ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">No. of passenger</dt>
            <dd className="inline-flex items-center gap-[3px] text-[#6B6B6B]"><Users size={16} className="text-[#1C1C1C]" aria-label="passengers" />{card.people}<Luggage size={16} className="ml-[5px] text-[#1C1C1C]" aria-label="bags" />{card.bags ?? 0}</dd></div> : null}
        </Fragment>)}
      </dl>
      <div className="border-t border-slate-100 px-4 py-3 text-[13px]">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Driver</p>
        {card.driver ? <p className="mt-0.5 font-medium">{card.driver.name}{card.driver.car ? ` · ${card.driver.car}` : ""}{card.driver.plate ? ` · ${card.driver.plate}` : ""}{card.driver.phone && <a href={`tel:${card.driver.phone.replace(/[^+\d]/g, "")}`} className="ml-1 font-bold text-[#C96100]">{card.driver.phone}</a>}</p>
          : <p className="mt-0.5 text-slate-600">Not assigned yet. Details come before your trip.</p>}
      </div>
      <div className="border-t border-slate-100 px-4 py-3"><a href={card.manageUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 w-full items-center justify-center rounded-full border border-[#FE8B05] text-[13px] font-bold text-[#C96100] hover:bg-orange-50">Manage booking</a></div>
    </div>;
  }
  if (card.type === "quote") return <div className={shell}>
    <div className="bg-[#FFF3E6] px-4 py-3">
      <p className="text-[15px] font-bold leading-snug">{card.title}</p>
      {card.subtitle && <p className="mt-0.5 text-[12.5px] text-slate-600">{card.subtitle}</p>}
    </div>
    <ul className="divide-y divide-slate-100">
      {card.cars.map((c, i) => {
        const v = c.vehicle && FLEET[c.vehicle];
        const cheapest = i === 0 && card.cars.length > 1 && card.cars.every((x) => x.price >= c.price);
        return <li key={c.name} className="flex items-center gap-3 px-3.5 py-3">
          {v && <span className="grid h-[54px] w-[78px] shrink-0 place-items-center overflow-hidden rounded-xl bg-[#F6F7F9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.image} alt="" width={78} height={54} loading="lazy" className="h-full w-full object-contain" />
          </span>}
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold leading-tight">{v ? v.label : c.name}{cheapest && <span className="ml-1.5 inline-block rounded-full bg-emerald-50 px-1.5 py-px align-[1px] text-[10.5px] font-bold text-emerald-700">Best price</span>}</p>
            {v && <p className="mt-0.5 truncate text-[12px] text-slate-500">{v.models}</p>}
            <p className="mt-1 flex items-center gap-[3px] text-[13px] text-[#6B6B6B]"><span>{c.seats}</span><Users size={16} className="text-[#1C1C1C]" aria-label="passengers" /><span className="ml-[5px]">{c.bags}</span><Luggage size={16} className="text-[#1C1C1C]" aria-label="bags" /></p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[14.5px] font-bold">{thb(c.price)}</p>
            <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex h-8 items-center rounded-full bg-[#FE8B05] px-3.5 text-[12.5px] font-bold text-white hover:bg-[#E67900]">Book</a>
          </div>
        </li>;
      })}
    </ul>
    {card.notes.length > 0 && <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] leading-snug text-slate-500">{card.notes.join(" ")}</p>}
  </div>;

  if (card.type === "places") return <div className={shell}>
    <div className="bg-[#FFF3E6] px-4 py-3"><p className="text-[15px] font-bold capitalize leading-snug">{card.title}</p><p className="mt-0.5 text-[12px] text-slate-500">From Google Maps · live ratings</p></div>
    <ul className="divide-y divide-slate-100">
      {card.items.map((p) => <li key={p.mapsUrl} className="flex gap-3 px-3.5 py-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#F6F7F9] text-slate-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.photo ? <img src={p.photo} alt="" width={64} height={64} loading="lazy" className="size-full object-cover" /> : <MapPin size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-tight">{p.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-slate-600">
            {p.rating !== null && <span className="inline-flex items-center gap-0.5 font-semibold text-[#15161C]"><Star size={13} className="fill-[#FFB400] text-[#FFB400]" aria-hidden="true" />{p.rating.toFixed(1)}<span className="font-normal text-slate-500">({(p.reviews ?? 0).toLocaleString("en-US")})</span></span>}
            {p.kind && <span>· {p.kind}</span>}{p.price && <span>· {p.price}</span>}{typeof p.distanceKm === "number" && <span>· {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm} km`} away</span>}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-slate-500">{p.address}</p>
          {p.alert && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[11.5px] font-semibold text-amber-800">⚠️ Waydidi notice: {p.alert}</p>}
          <div className="mt-1.5 flex items-center gap-2">
            {p.openNow !== null && <span className={`rounded-full px-1.5 py-px text-[11px] font-bold ${p.openNow ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.openNow ? "Open now" : "Closed now"}</span>}
            <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-full border border-[#FE8B05] px-2.5 text-[12px] font-bold text-[#C96100] hover:bg-orange-50">Map</a>
          </div>
        </div>
      </li>)}
    </ul>
  </div>;

  if (card.type === "payment") return <div className={shell}>
    <div className="bg-[#FFF3E6] px-4 py-3"><p className="text-[12px] font-semibold uppercase tracking-wide text-[#B85D00]">{card.title}</p></div>
    <dl className="grid gap-1.5 px-4 py-3 text-[13px]">
      {card.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
    </dl>
    <div className="flex items-baseline justify-between border-t border-slate-100 px-4 py-3"><span className="text-[13px] font-semibold">Total</span><span className="text-[19px] font-bold">{thb(card.amount)}</span></div>
    <div className="px-4 pb-4">
      <a href={card.url} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-full bg-[#FE8B05] text-[15px] font-bold text-white hover:bg-[#E67900]">Pay {thb(card.amount)}</a>
      <p className="mt-2 flex items-center justify-center gap-1 text-[11.5px] text-slate-500"><Clock size={12} aria-hidden="true" />Valid until {new Date(card.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} · secure payment page</p>
    </div>
  </div>;

  return <div className={shell}>
    <div className="flex items-center gap-2 bg-emerald-50 px-4 py-3 text-emerald-800"><CheckCircle2 size={18} aria-hidden="true" /><p className="text-[14px] font-bold">Booking confirmed</p></div>
    <div className="px-4 py-3">
      <p className="text-[12px] text-slate-500">Booking reference</p>
      <p className="text-[20px] font-bold tracking-wide">{card.reference}</p>
      <dl className="mt-2 grid gap-1.5 text-[13px]">
        {card.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
      </dl>
      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[13px]"><span className="text-slate-500">Paid</span> <b>{thb(card.amount)}</b>{card.test && <span className="ml-1 text-violet-700">(test, no money charged)</span>}</p>
    </div>
  </div>;
}

// "Share my location": the browser asks the customer's permission; only the rounded position is sent.
function LocationAsk({ text, onShare }: { text: string; onShare?: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "asking" | "sent" | "denied">("idle");
  function share() {
    if (!navigator.geolocation || !onShare) { setState("denied"); return; }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => { onShare(`📍 My location: ${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`); setState("sent"); },
      () => setState("denied"), { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }
  return <div className={shell}>
    <div className="flex gap-3 px-4 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><MapPin size={20} /></span>
      <p className="text-[13.5px] leading-snug text-slate-700">{text}</p>
    </div>
    <div className="border-t border-slate-100 px-4 py-3">
      {state === "sent" ? <p className="text-[13px] font-semibold text-emerald-700">Location shared. Looking nearby…</p>
        : state === "denied" ? <p className="text-[13px] text-slate-600">Location isn&apos;t available. Just type your hotel or area instead.</p>
        : <button type="button" disabled={state === "asking"} onClick={share} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#FE8B05] text-[14px] font-bold text-white hover:bg-[#E67900] disabled:opacity-60"><MapPin size={16} />{state === "asking" ? "Waiting for permission…" : "Share my location"}</button>}
    </div>
  </div>;
}

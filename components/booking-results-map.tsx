"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ArrowLeft, ArrowRightLeft, CheckCircle2, Clock3, MapPin } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { google?: any }
}

export type MapQuote = {
  distanceMeters: number;
  durationSeconds: number;
  averageDurationMinutes?: number;
  encodedPolyline?: string;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
};

type Vehicle = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  image?: string;
  popular?: boolean;
};

type Props = {
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  vehicles: Vehicle[];
  selectedVehicle: string;
  quote: MapQuote | null;
  returnQuote?: MapQuote | null;
  returnDate?: string;
  returnTime?: string;
  returnTrip?: boolean;
  priceBreakdown?: Record<string, { outbound: number; return: number; total: number }>;
  checkoutReady?: boolean;
  loading: boolean;
  error: string;
  onSelectVehicle: (id: string) => void;
  onEdit: () => void;
  onContinue: () => void;
  onRetry: () => void;
};

function shortPlace(value: string) {
  return value.split(",")[0]?.trim() || value;
}

function durationLabel(minutes: number) {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return hours ? `${hours} hr${mins ? ` ${mins} min` : ""}` : `${mins} min`;
}

function dateLabel(date: string, time: string) {
  const value = new Date(`${date}T${time}:00+07:00`);
  return `${value.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" })} · ${value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Bangkok" })}`;
}

export function BookingResultsMap(props: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const selected = props.vehicles.find((item) => item.id === props.selectedVehicle) ?? props.vehicles[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (window.google?.maps) { setMapReady(true); return; }
      const response = await fetch("/api/maps/config", { cache: "no-store" });
      const { apiKey } = await response.json() as { apiKey?: string };
      if (!apiKey || cancelled) return;
      const existing = document.querySelector<HTMLScriptElement>("script[data-waydidi-google-maps]");
      if (existing) { existing.addEventListener("load", () => !cancelled && setMapReady(true), { once: true }); return; }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry&v=weekly`;
      script.async = true;
      script.dataset.waydidiGoogleMaps = "true";
      script.addEventListener("load", () => !cancelled && setMapReady(true), { once: true });
      document.head.appendChild(script);
    }
    load().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !props.quote?.pickup || !props.quote.dropoff || !window.google?.maps) return;
    const maps = window.google.maps;
    const map = new maps.Map(mapRef.current, {
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: "cooperative",
      mapId: "DEMO_MAP_ID",
    });
    const pickup = { lat: props.quote.pickup.latitude, lng: props.quote.pickup.longitude };
    const dropoff = { lat: props.quote.dropoff.latitude, lng: props.quote.dropoff.longitude };
    const route = props.quote.encodedPolyline && maps.geometry?.encoding
      ? maps.geometry.encoding.decodePath(props.quote.encodedPolyline)
      : [pickup, dropoff];
    new maps.Polyline({ map, path: route, strokeColor: "#FF8A05", strokeOpacity: 1, strokeWeight: 6 });
    const marker = (position: {lat:number;lng:number}, color: string, label: string) => new maps.Marker({
      map, position, title: label,
      icon: { path: maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 4, scale: 10 },
    });
    marker(pickup, "#FF8A05", `Pickup: ${props.pickup}`);
    marker(dropoff, "#21140A", `Destination: ${props.dropoff}`);
    const bounds = new maps.LatLngBounds();
    route.forEach((point: any) => bounds.extend(point));
    bounds.extend(pickup); bounds.extend(dropoff);
    map.fitBounds(bounds, { top: 70, right: 46, bottom: window.innerWidth < 768 ? 270 : 90, left: 46 });
  }, [mapReady, props.quote, props.pickup, props.dropoff]);

  return <section className="relative min-h-[calc(100svh-72px)] overflow-hidden bg-[#F5F1EC]" aria-live="polite">
    <div className="relative h-[53svh] min-h-[410px] w-full lg:h-[calc(100svh-72px)] lg:min-h-[720px]">
      <div ref={mapRef} className="absolute inset-0 bg-[linear-gradient(135deg,#f0eee9,#dfe7df)]" aria-label={`Route map from ${props.pickup} to ${props.dropoff}`} />
      {!props.quote && <div className="absolute inset-0 grid place-items-center bg-[#EEEAE3]">
        <div className="rounded-2xl bg-white/95 px-6 py-5 text-center shadow-xl">
          <span className="mx-auto block size-8 animate-spin rounded-full border-4 border-[#FF8A05] border-r-transparent motion-reduce:animate-none" />
          <p className="mt-3 font-bold text-[#21140A]">Calculating your route…</p>
        </div>
      </div>}
      <button onClick={props.onEdit} className="absolute left-5 top-5 z-10 grid size-12 place-items-center rounded-full bg-white text-[#21140A] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05]" aria-label="Edit trip">
        <ArrowLeft size={22}/>
      </button>
    </div>

    <div className="relative z-10 -mt-10 rounded-t-[30px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-14px_40px_rgba(33,20,10,.16)] md:px-8 lg:absolute lg:bottom-8 lg:right-8 lg:mt-0 lg:max-h-[calc(100%-64px)] lg:w-[430px] lg:overflow-y-auto lg:rounded-[28px] lg:px-6 lg:pb-6">
      <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" aria-hidden="true" />
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-[-.035em] text-[#21140A]">{shortPlace(props.pickup)} → {shortPlace(props.dropoff)}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{dateLabel(props.date, props.time)}</p>
        </div>
        <button onClick={props.onEdit} className="min-h-11 shrink-0 rounded-full px-3 text-sm font-black text-[#C96100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05]">Edit</button>
      </div>

      {props.error ? <div className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm text-[#6D3700]">
        <strong className="block">We couldn&apos;t calculate this route.</strong>
        <span>Please check your pickup and destination.</span>
        <div className="mt-3 flex gap-2"><button onClick={props.onEdit} className="min-h-11 rounded-full bg-white px-4 font-bold">Edit trip</button><button onClick={props.onRetry} className="min-h-11 rounded-full bg-[#FF8A05] px-4 font-bold text-[#21140A]">Try again</button></div>
      </div> : props.quote ? <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#F7F5F2] p-4"><MapPin size={18} className="text-[#FF8A05]"/><p className="mt-2 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Distance</p><p className="mt-0.5 text-lg font-black text-[#21140A]">{(props.quote.distanceMeters/1000).toFixed(1)} km</p></div>
        <div className="rounded-2xl bg-[#FFF2E2] p-4"><Clock3 size={18} className="text-[#D96F00]"/><p className="mt-2 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Average travel time</p><p className="mt-0.5 text-lg font-black text-[#21140A]">{durationLabel(props.quote.averageDurationMinutes ?? props.quote.durationSeconds/60)}</p></div>
      </div> : <div className="mt-5 grid grid-cols-2 gap-3"><div className="h-24 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none"/><div className="h-24 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none"/></div>}

      {props.returnTrip && props.returnQuote && props.returnDate && props.returnTime && (
        <div className="mt-3 rounded-2xl border border-orange-200 bg-[#FFF9F2] p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FF8A05] text-white"><ArrowRightLeft size={17}/></span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[.1em] text-[#B85E00]">Return journey</p>
              <p className="mt-1 truncate font-black text-[#21140A]">{shortPlace(props.dropoff)} → {shortPlace(props.pickup)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{dateLabel(props.returnDate, props.returnTime)} · {(props.returnQuote.distanceMeters / 1000).toFixed(1)} km · {durationLabel(props.returnQuote.averageDurationMinutes ?? props.returnQuote.durationSeconds / 60)}</p>
            </div>
          </div>
        </div>
      )}

      <h2 className="mt-6 text-sm font-black uppercase tracking-[.12em] text-[#21140A]">Choose your ride</h2>
      <div className="mt-3 space-y-3">
        {props.vehicles.map((item) => {
          const active = item.id === props.selectedVehicle;
          return <button key={item.id} type="button" disabled={!props.quote} onClick={() => props.onSelectVehicle(item.id)} aria-pressed={active} className={`relative grid min-h-[118px] w-full grid-cols-[92px_1fr_auto] items-center gap-3 rounded-[22px] border-2 p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05] disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-[#FF8A05] bg-[#FFF7ED]" : "border-slate-200 bg-white"}`}>
            <span className="grid h-[82px] place-items-center">{item.image ? <Image src={item.image} alt="" width={184} height={156} className="max-h-[78px] w-full object-contain"/> : <span className="grid size-16 place-items-center rounded-full bg-slate-100 text-3xl">🚘</span>}</span>
            <span className="min-w-0"><strong className="block text-base text-[#21140A]">{item.name}</strong><span className="mt-0.5 block text-xs text-slate-500">{item.tagline}</span></span>
            <span className="self-start pt-1 text-right"><strong className="block whitespace-nowrap text-lg text-[#21140A]">฿{item.price.toLocaleString()}</strong>{props.returnTrip && <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">round trip</span>}{active && <CheckCircle2 className="ml-auto mt-3 text-[#D96F00]" size={21}/>}</span>
          </button>;
        })}
      </div>
      {props.returnTrip && selected && props.priceBreakdown?.[selected.id] && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between text-slate-600"><span>Outbound</span><strong className="text-[#21140A]">฿{props.priceBreakdown[selected.id].outbound.toLocaleString()}</strong></div>
          <div className="mt-2 flex justify-between text-slate-600"><span>Return</span><strong className="text-[#21140A]">฿{props.priceBreakdown[selected.id].return.toLocaleString()}</strong></div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-black text-[#21140A]"><span>Round-trip total</span><span>฿{props.priceBreakdown[selected.id].total.toLocaleString()}</span></div>
        </div>
      )}
      <button disabled={!props.quote || props.loading || !selected || props.checkoutReady === false} onClick={props.onContinue} className="mt-5 flex min-h-14 w-full items-center justify-center rounded-full bg-[#FF8A05] px-6 text-base font-black uppercase tracking-[.04em] text-[#21140A] shadow-lg shadow-orange-900/15 transition hover:bg-[#F47F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21140A] disabled:opacity-50">Book {selected?.name ?? "this ride"}</button>
      <p className="mt-3 text-center text-xs text-slate-500">Private ride · price shown before payment</p>
    </div>
  </section>;
}

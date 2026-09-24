"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ArrowLeft, ArrowRightLeft, Banknote, CalendarDays, CarFront, CheckCircle2, ChevronDown, Clock3, CreditCard, Info, Luggage, MoreHorizontal, Users } from "lucide-react";
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

export type Vehicle = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  image?: string;
  popular?: boolean;
  passengers?: number;
  bags?: number;
  // False when the group is larger than the vehicle carries.
  fits?: boolean;
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
  payment?: "card" | "cash";
  onPaymentChange?: (value: "card" | "cash") => void;
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

// Map pins and the labels beside them are plain HTML placed over the map.
function htmlOverlay(maps: any, map: any, position: any, html: string, anchor: "pin" | "bubble" | "chip") {
  const Overlay = class extends maps.OverlayView {
    div?: HTMLDivElement;
    onAdd() { this.div = document.createElement("div"); this.div.style.position = "absolute"; this.div.innerHTML = html; this.getPanes().floatPane.appendChild(this.div); }
    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(position);
      if (!point || !this.div) return;
      const { offsetWidth: w, offsetHeight: h } = this.div;
      this.div.style.left = `${point.x - (anchor === "chip" ? 18 : anchor === "bubble" ? 0 : w / 2)}px`;
      this.div.style.top = `${point.y - (anchor === "chip" ? h / 2 : h)}px`;
    }
    onRemove() { this.div?.remove(); }
  };
  const overlay = new Overlay();
  overlay.setMap(map);
  return overlay;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pinSvg(color: string) {
  return `<svg width="40" height="50" viewBox="0 0 40 50" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))"><path d="M20 49c-1.2 0-2-1-2.8-2.3C12 38.8 2 31 2 19.5 2 9.3 10 2 20 2s18 7.3 18 17.5C38 31 28 38.8 22.8 46.7 22 48 21.2 49 20 49Z" fill="${color}"/><circle cx="20" cy="19" r="7" fill="#fff"/></svg>`;
}

function placeChip(label: string) {
  return `<div style="display:flex;align-items:center;gap:6px;max-width:210px;margin-left:24px;padding:9px 14px;border-radius:999px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.18);font:600 15px Poppins,Helvetica,Arial,sans-serif;color:#1C1C1C;white-space:nowrap"><span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</span><span style="color:#555">›</span></div>`;
}

export function BookingResultsMap(props: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const selected = props.vehicles.find((item) => item.id === props.selectedVehicle) ?? props.vehicles[0];
  const minutes = props.quote ? props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60 : 0;

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
      gestureHandling: "greedy",
      mapId: "DEMO_MAP_ID",
    });
    const pickup = { lat: props.quote.pickup.latitude, lng: props.quote.pickup.longitude };
    const dropoff = { lat: props.quote.dropoff.latitude, lng: props.quote.dropoff.longitude };
    const route = props.quote.encodedPolyline && maps.geometry?.encoding
      ? maps.geometry.encoding.decodePath(props.quote.encodedPolyline)
      : [pickup, dropoff];
    // A darker casing under the line, as in ride-hailing apps.
    new maps.Polyline({ map, path: route, strokeColor: "#C96100", strokeOpacity: 1, strokeWeight: 9 });
    new maps.Polyline({ map, path: route, strokeColor: "#FF8A05", strokeOpacity: 1, strokeWeight: 6 });
    const overlays = [
      htmlOverlay(maps, map, new maps.LatLng(pickup), pinSvg("#E8472E"), "pin"),
      htmlOverlay(maps, map, new maps.LatLng(pickup), placeChip(shortPlace(props.pickup)), "chip"),
      htmlOverlay(maps, map, new maps.LatLng(dropoff), pinSvg("#2F80ED"), "pin"),
      htmlOverlay(maps, map, new maps.LatLng(dropoff), placeChip(shortPlace(props.dropoff)), "chip"),
    ];
    const middle = route[Math.floor(route.length / 2)];
    const minutesText = `${Math.max(1, Math.round((props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60)))} min·${(props.quote.distanceMeters / 1000).toFixed(1)} km`;
    overlays.push(htmlOverlay(maps, map, middle, `<div style="margin-bottom:6px;padding:8px 14px;border-radius:16px 16px 16px 4px;background:#C96100;color:#fff;font:500 15px/1.25 Poppins,Helvetica,Arial,sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.2)"><div>Best</div><div style="font-size:14px">${minutesText}</div></div>`, "bubble"));
    const bounds = new maps.LatLngBounds();
    route.forEach((point: any) => bounds.extend(point));
    bounds.extend(pickup); bounds.extend(dropoff);
    map.fitBounds(bounds, { top: 110, right: 70, bottom: 60, left: 40 });
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [mapReady, props.quote, props.pickup, props.dropoff]);

  return <section className="relative h-[100svh] overflow-hidden bg-white" aria-live="polite">
    {/* Map */}
    <div className="absolute inset-x-0 top-0 h-[38svh] lg:inset-y-0 lg:right-0 lg:left-[440px] lg:h-auto">
      <div ref={mapRef} className="absolute inset-0 bg-[linear-gradient(135deg,#f0eee9,#dfe7df)]" aria-label={`Route map from ${props.pickup} to ${props.dropoff}`} />
      {!props.quote && !props.error && <div className="absolute inset-0 grid place-items-center bg-[#EEEAE3]">
        <div className="rounded-2xl bg-white/95 px-6 py-5 text-center shadow-xl">
          <span className="mx-auto block size-8 animate-spin rounded-full border-4 border-brand border-r-transparent motion-reduce:animate-none" />
          <p className="mt-3 font-medium text-ink">Calculating your route…</p>
        </div>
      </div>}
      <div className="absolute inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-10 flex items-center justify-between gap-3">
        <button onClick={props.onEdit} className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#1C1C1C] shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Edit trip">
          <ArrowLeft size={24} />
        </button>
        <button onClick={props.onEdit} className="flex min-w-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-base font-medium text-[#1C1C1C] shadow-md">
          <Clock3 size={20} className="shrink-0 text-brand" aria-hidden="true" /><span className="truncate">{dateLabel(props.date, props.time)}</span>
        </button>
        <span className="size-11 shrink-0" aria-hidden="true" />
      </div>
    </div>

    {/* Sheet */}
    <div className="absolute inset-x-0 bottom-0 top-[calc(38svh-20px)] z-10 flex flex-col rounded-t-[20px] bg-white shadow-[0_-4px_16px_rgba(0,0,0,.08)] lg:inset-y-0 lg:left-0 lg:right-auto lg:top-0 lg:w-[440px] lg:rounded-none">
      <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#E3E3E3]" aria-hidden="true" />
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {props.error ? <div className="mb-3 rounded-2xl bg-orange-50 p-4 text-sm text-[#6D3700]">
          <strong className="block">We couldn&apos;t calculate this route.</strong>
          <span>Please check your pickup and destination.</span>
          <div className="mt-3 flex gap-2"><button onClick={props.onEdit} className="min-h-11 rounded-full bg-white px-4 font-medium">Edit trip</button><button onClick={props.onRetry} className="min-h-11 rounded-full bg-brand px-4 font-medium text-white">Try again</button></div>
        </div> : null}

        {props.returnTrip && props.returnQuote && props.returnDate && props.returnTime && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#FFF4E8] px-4 py-3 text-sm">
            <ArrowRightLeft size={18} className="shrink-0 text-brand-deep" aria-hidden="true" />
            <span className="min-w-0"><span className="block font-medium text-[#1C1C1C]">Return · {shortPlace(props.dropoff)} → {shortPlace(props.pickup)}</span><span className="block text-[#6B6B6B]">{dateLabel(props.returnDate, props.returnTime)}</span></span>
          </div>
        )}

        <ul className="grid gap-1">
          {props.vehicles.map((item) => {
            const active = item.id === selected?.id;
            const disabled = !props.quote || item.fits === false;
            const breakdown = props.priceBreakdown?.[item.id];
            return <li key={item.id}>
              <button type="button" disabled={disabled} aria-pressed={active} onClick={() => active && breakdown ? setShowBreakdown(!showBreakdown) : props.onSelectVehicle(item.id)} className={`grid w-full grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-2 border-brand py-4" : "border-2 border-transparent py-5 enabled:hover:bg-[#FAFAFA]"}`}>
                <span className="grid h-16 place-items-center">{item.image ? <Image src={item.image} alt="" width={184} height={156} unoptimized className="max-h-16 w-full object-contain" /> : <CarFront size={40} className="text-[#9A9A9A]" aria-hidden="true" />}</span>
                <span className="min-w-0">
                  <strong className="block truncate text-[17px] font-semibold text-[#1C1C1C]">{item.name}</strong>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[15px] text-[#6B6B6B]">
                    {props.quote ? `${durationLabel(minutes)}` : "—"}
                    {item.passengers !== undefined && <><span aria-hidden="true">·</span><Users size={15} className="text-[#1C1C1C]" aria-hidden="true" /><span aria-label={`${item.passengers} passengers`}>{item.passengers}</span></>}
                    {item.bags !== undefined && <><Luggage size={15} className="ml-1 text-[#1C1C1C]" aria-hidden="true" /><span aria-label={`${item.bags} bags`}>{item.bags}</span></>}
                  </span>
                  {item.fits === false ? <span className="mt-1.5 block text-sm font-medium text-brand-deep">Too small for your group</span>
                    : active && <span className="mt-2 flex min-w-0 items-center gap-2"><span className="truncate rounded-md bg-[#FFF1E0] px-2.5 py-1 text-[14px] text-[#B85800]">{item.tagline}</span><Info size={18} className="shrink-0 text-[#6B6B6B]" aria-hidden="true" /></span>}
                </span>
                <span className="flex items-center gap-1 self-start pt-1 text-[17px] font-semibold text-[#1C1C1C]">
                  ฿{item.price.toLocaleString()}
                  {active && breakdown && <ChevronDown size={20} className={`transition ${showBreakdown ? "rotate-180" : ""}`} aria-hidden="true" />}
                </span>
              </button>
              {active && breakdown && showBreakdown && <div className="mx-3 mt-2 rounded-xl bg-[#F7F7F7] p-4 text-sm">
                <div className="flex justify-between text-[#6B6B6B]"><span>Outbound</span><span className="text-[#1C1C1C]">฿{breakdown.outbound.toLocaleString()}</span></div>
                <div className="mt-2 flex justify-between text-[#6B6B6B]"><span>Return</span><span className="text-[#1C1C1C]">฿{breakdown.return.toLocaleString()}</span></div>
                <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold"><span>Round-trip total</span><span>฿{breakdown.total.toLocaleString()}</span></div>
              </div>}
            </li>;
          })}
        </ul>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-[#EEEEEE] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1 shadow-[0_-6px_16px_rgba(0,0,0,.05)]">
        <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)_1px_48px] items-center py-2 text-[15px] text-[#1C1C1C]">
          <button type="button" onClick={() => props.onPaymentChange?.(props.payment === "cash" ? "card" : "cash")} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left" aria-label={`Payment: ${props.payment === "cash" ? "cash to driver" : "card"}. Tap to change.`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1F3F66] text-white">{props.payment === "cash" ? <Banknote size={18} aria-hidden="true" /> : <CreditCard size={18} aria-hidden="true" />}</span>
            <span className="truncate">{props.payment === "cash" ? "Cash" : "Card"}</span>
          </button>
          <span className="h-8 bg-[#E6E6E6]" aria-hidden="true" />
          <span className="truncate px-2 text-center">{props.quote ? `${(props.quote.distanceMeters / 1000).toFixed(1)} km` : "—"}</span>
          <span className="h-8 bg-[#E6E6E6]" aria-hidden="true" />
          <button type="button" onClick={props.onEdit} className="grid min-h-11 place-items-center" aria-label="Edit trip"><MoreHorizontal size={24} aria-hidden="true" /></button>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={props.onEdit} className="grid size-14 shrink-0 place-items-center rounded-full bg-[#FFF4E8] text-[#1C1C1C]" aria-label="Change pickup date and time"><CalendarDays size={26} aria-hidden="true" /></button>
          <button disabled={!props.quote || props.loading || !selected || selected.fits === false || props.checkoutReady === false} onClick={props.onContinue} className="flex h-14 min-w-0 flex-1 items-center justify-center truncate rounded-full bg-brand px-6 text-lg font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50">Book {selected?.name ?? "this ride"}</button>
        </div>
      </div>
    </div>
  </section>;
}

// Shared by the transfer results and the hourly vehicle step so both look alike.
export function VehicleOption({ item, active, disabled = false, note, priceText, onSelect }: { item: Vehicle; active: boolean; disabled?: boolean; note?: string; priceText?: string; onSelect: () => void }) {
  const tooSmall = item.fits === false;
  return <button type="button" disabled={disabled || tooSmall} onClick={onSelect} aria-pressed={active} className={`relative grid min-h-[118px] w-full grid-cols-[92px_1fr_auto] items-center gap-3 rounded-[22px] border-2 p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-brand bg-cream shadow-md shadow-orange-950/5" : "border-slate-200 bg-white enabled:hover:border-orange-200"}`}>
    {item.popular && <span className="absolute -top-2.5 left-4 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[.06em] text-white">Most popular</span>}
    <span className="grid h-[82px] place-items-center">{item.image ? <Image src={item.image} alt="" width={184} height={156} unoptimized className="max-h-[78px] w-full object-contain"/> : <span className="grid size-16 place-items-center rounded-full bg-brand-soft text-brand-deep"><CarFront size={30} aria-hidden="true"/></span>}</span>
    <span className="min-w-0"><strong className="block text-base text-ink">{item.name}</strong><span className="mt-0.5 block text-xs text-slate-500">{item.tagline}</span>
      {item.passengers !== undefined && item.bags !== undefined && <span className="mt-1.5 flex items-center gap-3 text-xs font-semibold text-slate-600" aria-label={`Up to ${item.passengers} passengers and ${item.bags} bags`}><span className="inline-flex items-center gap-1"><Users size={13} aria-hidden="true"/>{item.passengers}</span><span className="inline-flex items-center gap-1"><Luggage size={13} aria-hidden="true"/>{item.bags}</span></span>}
      {tooSmall && <span className="mt-1 block text-xs font-bold text-brand-deep">Too small for your group</span>}
    </span>
    <span className="flex flex-col items-end gap-2 self-stretch py-1 text-right">
      <span><strong className={`block whitespace-nowrap font-black tracking-[-.02em] text-ink ${priceText ? "text-sm" : "text-xl"}`}>{priceText ?? `฿${item.price.toLocaleString()}`}</strong>{note && <span className="block text-[11px] font-semibold text-slate-500">{note}</span>}</span>
      {/* Every card shows the selection state, not just the chosen one. */}
      {active ? <CheckCircle2 className="mt-auto text-brand-deep" size={22} aria-hidden="true"/> : <span className="mt-auto size-[22px] rounded-full border-2 border-slate-300" aria-hidden="true"/>}
    </span>
  </button>;
}

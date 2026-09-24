"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ArrowLeft, ArrowRightLeft, CarFront, Check, CheckCircle2, CircleHelp, Flame, Info, Lightbulb, Luggage, Pencil, Route, Users, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCurrency } from "@/components/use-currency";
import { decodePolyline } from "@/lib/demo-route";
import { TRAFFIC_COLORS, TRAFFIC_REFRESH_MS, sampleIntervals, trafficSegments, type SpeedInterval, type TrafficRoute } from "@/lib/traffic";
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
  // Route points when there is no Google polyline (prototype route).
  path?: [number, number][];
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
  passengers?: number;
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

function squarePin(color: string) {
  return `<div style="width:22px;height:22px;border-radius:4px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transform:translateY(11px)"></div>`;
}

// Transfeero-style label: place on the left, time block on the right.
function timeLabel(kind: string, place: string, time: string, timeBg: string, timeColor: string) {
  const [clock, meridiem] = time.split(" ");
  return `<div style="display:flex;align-items:stretch;max-width:260px;margin-bottom:14px;border-radius:999px 8px 8px 999px;overflow:hidden;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15);font-family:Poppins,Helvetica,Arial,sans-serif;color:#1C1C1C;white-space:nowrap"><div style="min-width:0;padding:6px 12px 6px 16px"><div style="font-size:11px;color:#777">${kind}</div><div style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis">${escapeHtml(place)}</div></div><div style="display:grid;place-items:center;padding:4px 8px;background:${timeBg};color:${timeColor};font-size:14px;font-weight:600;line-height:1.1;text-align:center">${escapeHtml(clock)}<br><span style="font-size:11px;font-weight:500">${escapeHtml(meridiem ?? "")}</span></div></div>`;
}

function pillLabel(date: string, time: string) {
  const value = new Date(`${date}T${time}:00+07:00`);
  return `${value.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })}, ${value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}`;
}

function clockLabel(date: string, time: string, addMinutes = 0) {
  const value = new Date(new Date(`${date}T${time}:00+07:00`).getTime() + addMinutes * 60_000);
  return value.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function longDate(date: string) {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

function placeParts(value: string) {
  const [head, ...rest] = value.split(",");
  return { name: head?.trim() || value, detail: rest.join(",").trim() };
}

const GREY_MAP = [
  { elementType: "geometry", stylers: [{ saturation: -100 }, { lightness: 20 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", stylers: [{ color: "#d6d6d6" }] },
];

let leafletPromise: Promise<void> | null = null;
function loadLeaflet() {
  leafletPromise ??= new Promise<void>((resolve, reject) => {
    if ((window as any).L) return resolve();
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { leafletPromise = null; reject(new Error("Leaflet failed to load")); };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

export function BookingResultsMap(props: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const [traffic, setTraffic] = useState<TrafficRoute | null>(null);

  // Live traffic along the route, refreshed every 30 minutes while open.
  // Without a Google key the prototype route gets a labelled sample instead.
  useEffect(() => {
    const quote = props.quote;
    if (!quote?.pickup || !quote.dropoff) { setTraffic(null); return; }
    let alive = true;
    async function refresh() {
      try {
        const response = await fetch("/api/route-traffic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickup: quote!.pickup, dropoff: quote!.dropoff }) });
        if (response.ok) {
          const body = (await response.json()) as { encodedPolyline: string; intervals: SpeedInterval[]; durationSeconds?: number; fetchedAt: string };
          if (alive) setTraffic({ path: decodePolyline(body.encodedPolyline), intervals: body.intervals, durationSeconds: body.durationSeconds, fetchedAt: body.fetchedAt });
          return;
        }
      } catch { /* fall through to the sample */ }
      if (alive && quote!.path?.length) {
        const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }));
        setTraffic({ path: quote!.path, intervals: sampleIntervals(quote!.path.length, hour), fetchedAt: new Date().toISOString(), sample: true });
      }
    }
    refresh();
    const timer = window.setInterval(refresh, TRAFFIC_REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [props.quote]);
  const selected = props.vehicles.find((item) => item.id === props.selectedVehicle) ?? props.vehicles[0];
  const minutes = props.quote ? props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60 : 0;
  const cheapest = props.vehicles.filter((v) => v.fits !== false).reduce<Vehicle | undefined>((best, v) => !best || v.price < best.price ? v : best, undefined);
  const total = selected ? props.priceBreakdown?.[selected.id]?.total ?? selected.price : 0;
  const passengers = props.passengers ?? 0;
  const { currency, money, thb } = useCurrency();
  const [code, amount] = [money(0).split(" ")[0], (v: number) => money(v).split(" ")[1]];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (window.google?.maps) { setMapReady(true); return; }
      const response = await fetch("/api/maps/config", { cache: "no-store" });
      const { apiKey } = await response.json() as { apiKey?: string };
      if (cancelled) return;
      if (!apiKey) { await loadLeaflet(); if (!cancelled) setLeafletReady(true); return; }
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
    // No mapId here: a mapId would ignore the grey styles below.
    const map = new maps.Map(mapRef.current, { disableDefaultUI: true, clickableIcons: false, gestureHandling: "greedy", styles: GREY_MAP });
    const pickup = { lat: props.quote.pickup.latitude, lng: props.quote.pickup.longitude };
    const dropoff = { lat: props.quote.dropoff.latitude, lng: props.quote.dropoff.longitude };
    const route = props.quote.encodedPolyline && maps.geometry?.encoding
      ? maps.geometry.encoding.decodePath(props.quote.encodedPolyline)
      : [pickup, dropoff];
    const lines: any[] = [];
    if (traffic) {
      const all = traffic.path.map(([lat, lng]) => ({ lat, lng }));
      lines.push(new maps.Polyline({ map, path: all, strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: 9 }));
      for (const segment of trafficSegments(traffic.path, traffic.intervals)) {
        lines.push(new maps.Polyline({ map, path: segment.points.map(([lat, lng]) => ({ lat, lng })), strokeColor: TRAFFIC_COLORS[segment.speed], strokeOpacity: 1, strokeWeight: 6 }));
      }
    } else {
      lines.push(new maps.Polyline({ map, path: route, strokeColor: "#1C1C1C", strokeOpacity: 1, strokeWeight: 5 }));
    }
    const travel = traffic?.durationSeconds ? traffic.durationSeconds / 60 : props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60;
    const overlays = [
      htmlOverlay(maps, map, new maps.LatLng(pickup), squarePin("#1C1C1C"), "pin"),
      htmlOverlay(maps, map, new maps.LatLng(dropoff), squarePin("#FF8A05"), "pin"),
      htmlOverlay(maps, map, new maps.LatLng(pickup), timeLabel("Pick up", shortPlace(props.pickup), clockLabel(props.date, props.time), "#1C1C1C", "#fff"), "pin"),
      htmlOverlay(maps, map, new maps.LatLng(dropoff), timeLabel("Drop-off", shortPlace(props.dropoff), clockLabel(props.date, props.time, travel), "#FF8A05", "#1C1C1C"), "pin"),
    ];
    const bounds = new maps.LatLngBounds();
    route.forEach((point: any) => bounds.extend(point));
    bounds.extend(pickup); bounds.extend(dropoff);
    map.fitBounds(bounds, { top: 150, right: 60, bottom: 50, left: 60 });
    return () => { overlays.forEach((overlay) => overlay.setMap(null)); lines.forEach((line) => line.setMap(null)); };
  }, [mapReady, props.quote, props.pickup, props.dropoff, props.date, props.time, traffic]);


  // Without a Google key: free Leaflet map with CARTO light tiles.
  useEffect(() => {
    const L = (window as any).L;
    if (!leafletReady || !L || !mapRef.current || !props.quote?.pickup || !props.quote.dropoff) return;
    const pickup: [number, number] = [props.quote.pickup.latitude, props.quote.pickup.longitude];
    const dropoff: [number, number] = [props.quote.dropoff.latitude, props.quote.dropoff.longitude];
    const path = props.quote.path?.length ? props.quote.path : [pickup, dropoff];
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true });
    // OpenStreetMap tiles (no key needed), greyed to match the design.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const tiles = map.getPane("tilePane");
    if (tiles) tiles.style.filter = "grayscale(1) brightness(1.06) contrast(.92)";
    if (traffic) {
      L.polyline(traffic.path, { color: "#FFFFFF", weight: 9, opacity: 1 }).addTo(map);
      for (const segment of trafficSegments(traffic.path, traffic.intervals)) L.polyline(segment.points, { color: TRAFFIC_COLORS[segment.speed], weight: 6, opacity: 1 }).addTo(map);
    } else {
      L.polyline(path, { color: "#1C1C1C", weight: 5, opacity: 1 }).addTo(map);
    }
    const travel = traffic?.durationSeconds ? traffic.durationSeconds / 60 : props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60;
    const icon = (html: string) => L.divIcon({ className: "", html: `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-100%)">${html}</div>`, iconSize: [0, 0] });
    L.marker(pickup, { icon: icon(squarePin("#1C1C1C")), interactive: false }).addTo(map);
    L.marker(dropoff, { icon: icon(squarePin("#FF8A05")), interactive: false }).addTo(map);
    L.marker(pickup, { icon: icon(timeLabel("Pick up", shortPlace(props.pickup), clockLabel(props.date, props.time), "#1C1C1C", "#fff")), interactive: false }).addTo(map);
    L.marker(dropoff, { icon: icon(timeLabel("Drop-off", shortPlace(props.dropoff), clockLabel(props.date, props.time, travel), "#FF8A05", "#1C1C1C")), interactive: false }).addTo(map);
    map.fitBounds(L.latLngBounds(path), { paddingTopLeft: [60, 150], paddingBottomRight: [60, 40] });
    return () => map.remove();
  }, [leafletReady, props.quote, props.pickup, props.dropoff, props.date, props.time, traffic]);

  // Bottom sheet: collapsed (map 70%) or expanded (list fills most of the screen).
  const sheetRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{ startY: number; moved: boolean } | null>(null);
  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, moved: false };
    setDragY(0);
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dy) > 4) drag.current.moved = true;
    // Resist dragging past either end.
    const travel = window.innerHeight * 0.56;
    const limited = expanded ? Math.min(travel, Math.max(-20, dy)) : Math.max(-travel, Math.min(40, dy));
    setDragY(limited);
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    const dy = dragY ?? 0;
    setDragY(null);
    if (!state) return;
    if (event.type === "pointercancel") return;
    if (!state.moved) { setExpanded(!expanded); return; }
    if (!expanded && dy < -60) setExpanded(true);
    else if (expanded && dy > 60) setExpanded(false);
  }
  const sheetStyle = {
    "--sheet-top": expanded ? "calc(14svh)" : "calc(70svh - 20px)",
    transform: dragY ? `translateY(${dragY}px)` : undefined,
    transition: dragY === null ? "top .28s cubic-bezier(.2,.8,.2,1), transform .28s cubic-bezier(.2,.8,.2,1)" : "none",
  } as React.CSSProperties;

  const disabled = !props.quote || props.loading || !selected || selected.fits === false || props.checkoutReady === false;

  return <section className="relative h-[100svh] overflow-hidden bg-white" aria-live="polite">
    {/* Map */}
    <div className="absolute inset-x-0 top-0 h-[70svh] lg:inset-y-0 lg:left-[460px] lg:right-0 lg:h-auto">
      <div ref={mapRef} className="absolute inset-0 isolate z-0 bg-[#EDEDED]" aria-label={`Route map from ${props.pickup} to ${props.dropoff}`} />
      {!props.quote && !props.error && <div className="absolute inset-0 grid place-items-center bg-[#EDEDED]">
        <div className="rounded-2xl bg-white/95 px-6 py-5 text-center shadow-xl">
          <span className="mx-auto block size-8 animate-spin rounded-full border-4 border-brand border-r-transparent motion-reduce:animate-none" />
          <p className="mt-3 font-medium text-ink">Calculating your route…</p>
        </div>
      </div>}
      <button onClick={props.onEdit} className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] z-10 grid size-11 place-items-center rounded-full bg-white text-[#1C1C1C] shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Edit trip">
        <ArrowLeft size={22} />
      </button>
      <button type="button" onClick={props.onEdit} className="absolute left-1/2 top-[max(16px,env(safe-area-inset-top))] z-10 flex h-11 max-w-[calc(100%-140px)] -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 text-[16px] font-medium text-[#1C1C1C] shadow-md" aria-label="Edit passengers, date and time">
        <Users size={20} className="shrink-0 text-brand" aria-hidden="true" /><span className="truncate">{passengers} · {pillLabel(props.date, props.time)}</span>
      </button>
      {traffic && <div className="absolute bottom-7 left-4 z-10 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-[#1C1C1C] shadow-md">
        <span className="flex gap-0.5" aria-hidden="true">{(["NORMAL", "SLOW", "TRAFFIC_JAM"] as const).map((k) => <span key={k} className="h-1.5 w-3 rounded-full" style={{ background: TRAFFIC_COLORS[k] }} />)}</span>
        {traffic.sample ? "Sample traffic" : `Traffic · ${new Date(traffic.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}`}
      </div>}
    </div>

    {/* Sheet */}
    <div ref={sheetRef} style={sheetStyle} className="absolute inset-x-0 bottom-0 top-[var(--sheet-top)] z-10 flex flex-col rounded-t-[20px] bg-white shadow-[0_-4px_16px_rgba(0,0,0,.08)] lg:inset-y-0 lg:left-0 lg:right-auto lg:top-0 lg:w-[460px] lg:rounded-none">
      {/* Drag (or tap) the handle to pull the list up over the map and back down. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={expanded ? "Show more map" : "Show all cars"}
        aria-expanded={expanded}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing lg:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-[#D9D9D9]" aria-hidden="true" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-3 pt-2">

        {props.error ? <div className="mb-3 rounded-2xl bg-orange-50 p-4 text-sm text-[#6D3700]">
          <strong className="block">We couldn&apos;t calculate this route.</strong>
          <span>Please check your pickup and destination.</span>
          <div className="mt-3 flex gap-2"><button onClick={props.onEdit} className="min-h-11 rounded-full bg-white px-4 font-medium">Edit trip</button><button onClick={props.onRetry} className="min-h-11 rounded-full bg-brand px-4 font-medium text-white">Try again</button></div>
        </div> : null}

        <ul className="grid gap-3 pt-2">
          {props.vehicles.map((item) => {
            const active = item.id === selected?.id;
            const off = !props.quote || item.fits === false;
            const badge = item.fits === false ? null : item.id === cheapest?.id ? "best" : item.popular ? "popular" : null;
            return <li key={item.id}>
              <button type="button" disabled={off} aria-pressed={active} onClick={() => props.onSelectVehicle(item.id)} className={`relative grid w-full grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-[#F5B85A] bg-[#FDF8F1]" : "border-transparent enabled:hover:bg-[#FAFAFA]"}`}>
                <span className="grid h-14 place-items-center">{item.image ? <Image src={item.image} alt="" width={184} height={156} unoptimized className="max-h-14 w-full object-contain" /> : <CarFront size={44} className="text-[#9A9A9A]" aria-hidden="true" />}</span>
                <span className="min-w-0">
                  <strong className="block text-[17px] font-semibold leading-tight text-[#1C1C1C]">{item.name}</strong>
                  <span className="mt-1 flex items-center gap-1.5 text-[15px] text-[#6B6B6B]">
                    {item.passengers !== undefined && <><span>{item.passengers}</span><Users size={18} className="text-[#1C1C1C]" aria-label="passengers" /></>}
                    {item.bags !== undefined && <><span className="ml-2">{item.bags}</span><Luggage size={18} className="text-[#1C1C1C]" aria-label="bags" /></>}
                    <span className="ml-2 text-[#9A9A9A]" title={item.tagline}><CircleHelp size={18} aria-label={item.tagline} /></span>
                  </span>
                  {item.fits === false ? <span className="mt-2 block text-sm font-medium text-brand-deep">Too small for your group</span>
                    : null}
                  {/* Sits on the card's top edge so it adds no height. */}
                  {badge === "best" ? <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full border border-[#CFE8D1] bg-[#EEF7EE] px-2 py-px text-[12px] font-medium text-[#2E7D32]"><Lightbulb size={12} aria-hidden="true" />Best value</span>
                    : badge === "popular" ? <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full border border-[#F6CFCC] bg-[#FDECEC] px-2 py-px text-[12px] font-medium text-[#B3261E]"><Flame size={12} aria-hidden="true" />Most popular</span> : null}
                </span>
                <span className="self-start text-right">
                  <span className="block whitespace-nowrap text-[#1C1C1C]"><span className="text-[13px] text-[#4A4A4A]">{code} </span><strong className="text-[17px] font-semibold">{amount(item.price)}</strong></span>
                  {currency !== "THB" && <span className="mt-0.5 block text-[12px] text-[#8A8A8A]">~{thb(item.price)}</span>}
                  <span className="mt-0.5 block text-[12px] text-[#8A8A8A]">{props.returnTrip ? "Round trip" : "Total price"}</span>
                </span>
              </button>
            </li>;
          })}
        </ul>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-[#EEEEEE] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-baseline gap-2"><span className="text-[15px] text-[#4A4A4A]">Total</span><strong className="whitespace-nowrap text-[17px] font-semibold text-[#1C1C1C]">{money(total)}</strong></p>
          <button type="button" onClick={() => setDetailsOpen(true)} className="flex shrink-0 items-center gap-1.5 text-[15px] text-[#1C1C1C]"><Info size={18} aria-hidden="true" />Price and route</button>
        </div>
        <button disabled={disabled} onClick={props.onContinue} className="mt-2 flex h-[52px] w-full items-center justify-center rounded-full bg-brand text-[17px] font-semibold text-[#1C1C1C] transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50">Continue</button>
      </div>
    </div>

    <DialogPrimitive.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="font-home fixed inset-x-0 bottom-0 z-[81] flex max-h-[85dvh] flex-col rounded-t-[20px] bg-white text-[#1C1C1C] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#D9D9D9]" aria-hidden="true" />
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <DialogPrimitive.Title className="text-[26px] font-semibold leading-tight">Your Booking</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[16px] text-[#6B6B6B]">{props.returnTrip ? "Return" : "One way"}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="grid size-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Close"><X size={24} /></DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-8 pt-5">
            <div className="flex items-center justify-between">
              <strong className="text-[18px] font-medium">{props.returnTrip ? "Return" : "One way"}</strong>
              <span className="flex items-center gap-2 rounded-full border border-[#D9D9D9] px-4 py-1.5 text-[15px] font-medium"><Users size={18} aria-hidden="true" />{passengers} Passenger{passengers === 1 ? "" : "s"}</span>
            </div>

            <Leg title="Outward" date={props.date} time={props.time} from={props.pickup} to={props.dropoff} quote={props.quote} onEdit={() => { setDetailsOpen(false); props.onEdit(); }} />
            {props.returnTrip && props.returnDate && props.returnTime
              ? <Leg title="Return" date={props.returnDate} time={props.returnTime} from={props.dropoff} to={props.pickup} quote={props.returnQuote ?? null} onEdit={() => { setDetailsOpen(false); props.onEdit(); }} />
              : <button type="button" onClick={() => { setDetailsOpen(false); props.onEdit(); }} className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-dashed border-[#BDBDBD] text-[16px] text-[#1C1C1C]"><ArrowRightLeft size={20} className="text-brand" aria-hidden="true" />Add return</button>}

            <div className="mt-8 border-t border-[#E6E6E6] pt-6">
              <h3 className="flex items-center gap-3 text-[19px] font-medium"><Route size={22} aria-hidden="true" />Price and route</h3>
              {props.returnTrip && selected && props.priceBreakdown?.[selected.id] && <>
                <p className="mt-5 flex justify-between text-[16px] text-[#4A4A4A]"><span>Outward</span><span>{money(props.priceBreakdown[selected.id].outbound)}</span></p>
                <p className="mt-2 flex justify-between text-[16px] text-[#4A4A4A]"><span>Return</span><span>{money(props.priceBreakdown[selected.id].return)}</span></p>
              </>}
              <p className="mt-4 flex items-center gap-2 text-[14px] text-[#6B6B6B]"><Check size={16} aria-hidden="true" />All prices are fixed totals for your private ride</p>
              <p className="mt-4 flex items-center justify-between"><span className="text-[17px]">Total</span><strong className="text-[26px] font-semibold">{money(total)}</strong></p>
              <p className="mt-1 text-right text-[14px] text-[#8A8A8A]">{currency !== "THB" ? `~${thb(total)} · charged in THB` : selected?.name}</p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  </section>;
}

function Leg({ title, date, time, from, to, quote, onEdit }: { title: string; date: string; time: string; from: string; to: string; quote: MapQuote | null; onEdit: () => void }) {
  const minutes = quote ? quote.averageDurationMinutes ?? quote.durationSeconds / 60 : 0;
  const km = quote ? quote.distanceMeters / 1000 : 0;
  const start = placeParts(from);
  const end = placeParts(to);
  return <div className="mt-8">
    <div className="flex items-center justify-between">
      <p className="text-[17px] text-[#6B6B6B]"><strong className="font-medium">{title}</strong> · {longDate(date)}</p>
      <button type="button" onClick={onEdit} className="flex items-center gap-2 text-[16px]"><Pencil size={18} aria-hidden="true" />Edit</button>
    </div>
    <div className="relative mt-5 pl-9">
      <span className="absolute bottom-3 left-[6px] top-2 w-[3px] bg-[#1C1C1C]" aria-hidden="true" />
      <span className="absolute left-0 top-1.5 size-[15px] rounded-[3px] bg-[#1C1C1C]" aria-hidden="true" />
      <span className="absolute bottom-1 left-0 size-[15px] rounded-[3px] bg-brand" aria-hidden="true" />
      <div className="flex justify-between gap-3"><p className="min-w-0 truncate text-[18px]">{start.name}</p><p className="shrink-0 text-[17px] text-[#6B6B6B]">{clockLabel(date, time)}</p></div>
      {start.detail && <p className="truncate text-[14px] text-[#8A8A8A]">{start.detail}</p>}
      {quote && <div className="my-5 flex gap-1.5 text-[15px]"><span className="rounded-md border border-[#D9D9D9] px-2.5 py-0.5">~ {minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${Math.round(minutes % 60)} min` : `${Math.round(minutes)} min`}</span><span className="rounded-md border border-[#D9D9D9] px-2.5 py-0.5">~ {Math.round(km)} Km / {Math.round(km * 0.621)} Mi</span></div>}
      <div className="flex justify-between gap-3"><p className="min-w-0 truncate text-[18px]">{end.name}</p>{quote && <p className="shrink-0 text-[17px] text-[#6B6B6B]">{clockLabel(date, time, minutes)}</p>}</div>
      {end.detail && <p className="truncate text-[14px] text-[#8A8A8A]">{end.detail}</p>}
    </div>
  </div>;
}

// Shared by the transfer results and the hourly vehicle step so both look alike.
export function VehicleOption({ item, active, disabled = false, note, priceText, onSelect }: { item: Vehicle; active: boolean; disabled?: boolean; note?: string; priceText?: string; onSelect: () => void }) {
  const tooSmall = item.fits === false;
  const { money } = useCurrency();
  return <button type="button" disabled={disabled || tooSmall} onClick={onSelect} aria-pressed={active} className={`relative grid min-h-[118px] w-full grid-cols-[92px_1fr_auto] items-center gap-3 rounded-[22px] border-2 p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-brand bg-cream shadow-md shadow-orange-950/5" : "border-slate-200 bg-white enabled:hover:border-orange-200"}`}>
    {item.popular && <span className="absolute -top-2.5 left-4 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[.06em] text-white">Most popular</span>}
    <span className="grid h-[82px] place-items-center">{item.image ? <Image src={item.image} alt="" width={184} height={156} unoptimized className="max-h-[78px] w-full object-contain"/> : <span className="grid size-16 place-items-center rounded-full bg-brand-soft text-brand-deep"><CarFront size={30} aria-hidden="true"/></span>}</span>
    <span className="min-w-0"><strong className="block text-base text-ink">{item.name}</strong><span className="mt-0.5 block text-xs text-slate-500">{item.tagline}</span>
      {item.passengers !== undefined && item.bags !== undefined && <span className="mt-1.5 flex items-center gap-3 text-xs font-semibold text-slate-600" aria-label={`Up to ${item.passengers} passengers and ${item.bags} bags`}><span className="inline-flex items-center gap-1"><Users size={13} aria-hidden="true"/>{item.passengers}</span><span className="inline-flex items-center gap-1"><Luggage size={13} aria-hidden="true"/>{item.bags}</span></span>}
      {tooSmall && <span className="mt-1 block text-xs font-bold text-brand-deep">Too small for your group</span>}
    </span>
    <span className="flex flex-col items-end gap-2 self-stretch py-1 text-right">
      <span><strong className={`block whitespace-nowrap font-black tracking-[-.02em] text-ink ${priceText ? "text-sm" : "text-xl"}`}>{priceText ?? money(item.price)}</strong>{note && <span className="block text-[11px] font-semibold text-slate-500">{note}</span>}</span>
      {/* Every card shows the selection state, not just the chosen one. */}
      {active ? <CheckCircle2 className="mt-auto text-brand-deep" size={22} aria-hidden="true"/> : <span className="mt-auto size-[22px] rounded-full border-2 border-slate-300" aria-hidden="true"/>}
    </span>
  </button>;
}

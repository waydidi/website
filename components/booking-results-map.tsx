"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ArrowLeft, ArrowRightLeft, Baby, Banknote, CarFront, Check, CheckCircle2, CircleHelp, Flame, Info, Lightbulb, Luggage, Minus, Pencil, Plus, Route, Users, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCurrency } from "@/components/use-currency";
import { useI18n } from "@/components/i18n-provider";
import { CancelCalendar3D } from "@/components/icons/cancel-calendar-3d";
import { inclusionLines, parseInclusions, type Inclusions } from "@/lib/route-inclusions";
import { decodePolyline } from "@/lib/demo-route";
import { TRAFFIC_CASING, TRAFFIC_COLORS, TRAFFIC_REFRESH_MS, sampleIntervals, trafficSegments, type SpeedInterval, type TrafficRoute } from "@/lib/traffic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

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
  // What the fare includes on this route (tolls, ferry), from the quote.
  inclusions?: Inclusions;
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
  // Opens the edit-trip popup (passengers, date and time).
  onEditTrip?: () => void;
  // Additional services chosen from the "+" sheet.
  childSeats?: number;
  exchangeStop?: boolean;
  onExtrasChange?: (extras: { childSeats: number; exchangeStop: boolean }) => void;
};

function shortPlace(value: string) {
  return value.split(",")[0]?.trim() || value;
}



// Map pins and the labels beside them are plain HTML placed over the map.
function htmlOverlay(maps: any, map: any, position: any, html: string, anchor: "pin" | "bubble" | "chip" | "point") {
  const Overlay = class extends maps.OverlayView {
    div?: HTMLDivElement;
    onAdd() { this.div = document.createElement("div"); this.div.style.position = "absolute"; this.div.innerHTML = html; this.getPanes().floatPane.appendChild(this.div); }
    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(position);
      if (!point || !this.div) return;
      if (anchor === "point") { this.div.style.left = `${point.x}px`; this.div.style.top = `${point.y}px`; return; }
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


// Grab-style markers. Each is a zero-size box at the map point; its parts are
// placed around that point.
const GRAB_FONT = `-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif`;

function teardrop(fill: string) {
  return `<svg width="32" height="40" viewBox="0 0 40 50" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.28))"><path d="M20 49c-.9 0-1.6-.7-2.2-1.6C12.6 39.6 2.5 31.8 2.5 20 2.5 10.3 10.3 2.5 20 2.5S37.5 10.3 37.5 20c0 11.8-10.1 19.6-15.3 27.4-.6.9-1.3 1.6-2.2 1.6Z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="20" r="7.5" fill="#fff"/></svg>`;
}

// Pin is 32×40; its round head is 28px across, centred 23px above the tip.
const PIN_HEAD = 28;
const HEAD_CENTRE = 23;

function placeTag(name: string, side: "right" | "left") {
  // Same height as the pin head; the end under the pin is hidden behind it.
  const pad = side === "right" ? `padding:0 14px 0 ${PIN_HEAD / 2 + 10}px` : `padding:0 ${PIN_HEAD / 2 + 10}px 0 14px`;
  return `<div style="display:flex;align-items:center;gap:8px;height:${PIN_HEAD}px;width:max-content;max-width:230px;${pad};border-radius:999px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.16);font:600 14px/1 ${GRAB_FONT};color:#1C1C1C;white-space:nowrap;box-sizing:border-box"><span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</span><svg width="7" height="12" viewBox="0 0 8 13" style="flex:none"><path d="M1.5 1.5 6.5 6.5l-5 5" fill="none" stroke="#1C1C1C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
}

// Pin tip on the exact point; the tag starts at the pin's centre line.
function grabMarker(name: string, color: string, side: "right" | "left") {
  const tagTop = -HEAD_CENTRE - PIN_HEAD / 2;
  const tag = side === "right"
    ? `<div style="position:absolute;left:0;top:${tagTop}px">${placeTag(name, "right")}</div>`
    : `<div style="position:absolute;right:0;top:${tagTop}px">${placeTag(name, "left")}</div>`;
  return `<div style="position:relative;width:0;height:0">${tag}<div style="position:absolute;left:-16px;top:-39px">${teardrop(color)}</div></div>`;
}
const grabPickup = (name: string) => grabMarker(name, "#E8543C", "right");
const grabDropoff = (name: string) => grabMarker(name, "#3478F6", "left");

// Time/distance bubble beside the line: to the right of a mostly vertical
// stretch, above a mostly horizontal one, never on top of the route.
function grabBubble(minutes: number, km: number, placement: "right" | "above") {
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${Math.round(minutes % 60)} min` : `${Math.max(1, Math.round(minutes))} min`;
  const where = placement === "right"
    ? "left:18px;top:0;transform:translateY(-50%)"
    : "left:0;bottom:18px;transform:translateX(-50%)";
  return `<div style="position:relative;width:0;height:0"><div style="position:absolute;${where};width:max-content;padding:8px 14px 9px;border-radius:14px;background:#00B14F;color:#fff;font:500 15px/1.25 ${GRAB_FONT};white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.2)"><div>Best</div><div style="font-size:13px;font-weight:400;opacity:.95">${time}·${km.toFixed(1)} km</div></div></div>`;
}

// Point halfway along the route by distance, and which side the bubble goes.
function routeMiddle(path: [number, number][]) {
  if (path.length < 2) return { point: path[0], placement: "right" as const };
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180));
  const total = path.slice(1).reduce((sum, p, i) => sum + dist(path[i], p), 0);
  let run = 0, i = 1;
  for (; i < path.length; i++) { const step = dist(path[i - 1], path[i]); if (run + step >= total / 2) break; run += step; }
  const at = Math.min(i, path.length - 1);
  const before = path[Math.max(0, at - 3)], after = path[Math.min(path.length - 1, at + 3)];
  const dLat = Math.abs(after[0] - before[0]), dLng = Math.abs((after[1] - before[1]) * Math.cos((after[0] * Math.PI) / 180));
  return { point: path[at], placement: dLat >= dLng ? ("right" as const) : ("above" as const) };
}



// How far the sheet sits below its expanded position when collapsed: the
// map fills 70% of the screen, less the sheet's rounded overlap.
function collapsedOffset() {
  if (typeof window === "undefined") return 0;
  const h = window.innerHeight;
  return Math.max(0, h * 0.7 - 20 - h * 0.35);
}

// Space the sheet covers at the bottom of the map, plus a margin.
function mapBottomPadding(expanded: boolean) {
  if (typeof window === "undefined" || window.innerWidth >= 1024) return 60;
  const h = window.innerHeight;
  const covered = expanded ? h * 0.7 - h * 0.35 : 20;
  return Math.round(covered + (expanded ? 16 : 40));
}

// Room for the top buttons plus the pin's height above its point.
function mapTopPadding(expanded: boolean) {
  return expanded ? 125 : 170;
}

// Pickup time minus 24 hours, e.g. "24 September 2026, 09:00 am".
function cancelDeadlineAt(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`).getTime() - 24 * 3600_000;
}

function cancelDeadline(date: string, time: string) {
  const value = new Date(cancelDeadlineAt(date, time));
  const day = value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  const clock = value.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).toLowerCase();
  return `${day}, ${clock}`;
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

// Light map close to Grab's: pale land, white roads with grey edges, blue water.
const GREY_MAP = [
  { elementType: "geometry", stylers: [{ color: "#F3F4F6" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6B7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#DCEFD9" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#D5D8DD" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#E4E6EA" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#A9D3F5" }] },
]

// Typical models per class (matching the photos); the exact car may differ.
const VEHICLE_MODELS: Record<string, string> = {
  economy_sedan: "Toyota Corolla Altis or similar",
  comfort_bmw: "BMW 3 Series or similar",
  comfort_suv: "Toyota Fortuner or similar",
  premium_minivan: "Toyota Commuter or similar",
};

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
  // Vehicle whose "?" details sheet is open.
  const [infoId, setInfoId] = useState<string | null>(null);
  const info = props.vehicles.find((v) => v.id === infoId) ?? null;
  const [extrasOpen, setExtrasOpen] = useState(false);
  const seats = props.childSeats ?? 0;
  const exchange = props.exchangeStop ?? false;
  const maxSeats = Math.min(4, Math.max(1, props.passengers ?? 4));
  const extrasCount = seats + (exchange ? 1 : 0);
  const setExtras = (next: { childSeats: number; exchangeStop: boolean }) => props.onExtrasChange?.(next);
  const { locale } = useI18n();
  // Quotes carry their inclusions; for the prototype route (or an older saved
  // quote) look them up from the route rules.
  const [lookedUp, setLookedUp] = useState<Inclusions | null>(null);
  useEffect(() => {
    const q = props.quote;
    if (!q?.pickup || !q.dropoff || q.inclusions) return;
    let alive = true;
    fetch(`/api/route-inclusions?plat=${q.pickup.latitude}&plng=${q.pickup.longitude}&dlat=${q.dropoff.latitude}&dlng=${q.dropoff.longitude}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { inclusions?: unknown } | null) => { if (alive && body) setLookedUp(parseInclusions(JSON.stringify(body.inclusions))); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [props.quote]);
  const lines = inclusionLines(props.quote?.inclusions ?? lookedUp ?? { tolls: false, ferry: false, route: null }, locale);
  const [leafletReady, setLeafletReady] = useState(false);
  // Re-fits the route to the visible part of the map (set by whichever map is drawn).
  const fitRef = useRef<((bottomPadding: number) => void) | null>(null);
  const refitTimer = useRef<number | undefined>(undefined);
  const expandedRef = useRef(false);
  const [traffic, setTraffic] = useState<TrafficRoute | null>(null);

  // Live traffic along the route, refreshed every 30 minutes while open.
  // Without a Google key the prototype route gets a labelled sample instead.
  useEffect(() => {
    const quote = props.quote;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale traffic when the route changes
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
    const route = traffic ? traffic.path.map(([lat, lng]) => new maps.LatLng(lat, lng)) : props.quote.encodedPolyline && maps.geometry?.encoding
      ? maps.geometry.encoding.decodePath(props.quote.encodedPolyline)
      : [new maps.LatLng(pickup), new maps.LatLng(dropoff)];
    const lines: any[] = [];
    if (traffic) {
      const segments = trafficSegments(traffic.path, traffic.intervals);
      for (const segment of segments) lines.push(new maps.Polyline({ map, path: segment.points.map(([lat, lng]) => ({ lat, lng })), strokeColor: TRAFFIC_CASING[segment.speed], strokeOpacity: 1, strokeWeight: 9 }));
      for (const segment of segments) lines.push(new maps.Polyline({ map, path: segment.points.map(([lat, lng]) => ({ lat, lng })), strokeColor: TRAFFIC_COLORS[segment.speed], strokeOpacity: 1, strokeWeight: 6 }));
    } else {
      lines.push(new maps.Polyline({ map, path: route, strokeColor: TRAFFIC_CASING.NORMAL, strokeOpacity: 1, strokeWeight: 9 }));
      lines.push(new maps.Polyline({ map, path: route, strokeColor: TRAFFIC_COLORS.NORMAL, strokeOpacity: 1, strokeWeight: 6 }));
    }
    const travel = traffic?.durationSeconds ? traffic.durationSeconds / 60 : props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60;
    const middle = routeMiddle(route.map((p: any) => [p.lat(), p.lng()] as [number, number]));
    const overlays = [
      htmlOverlay(maps, map, new maps.LatLng(middle.point[0], middle.point[1]), grabBubble(travel, props.quote.distanceMeters / 1000, middle.placement), "point"),
      htmlOverlay(maps, map, new maps.LatLng(dropoff), grabDropoff(shortPlace(props.dropoff)), "point"),
      htmlOverlay(maps, map, new maps.LatLng(pickup), grabPickup(shortPlace(props.pickup)), "point"),
    ];
    const bounds = new maps.LatLngBounds();
    route.forEach((point: any) => bounds.extend(point));
    bounds.extend(pickup); bounds.extend(dropoff);
    fitRef.current = (bottom) => map.fitBounds(bounds, { top: mapTopPadding(expandedRef.current), right: 110, bottom, left: 70 });
    fitRef.current(mapBottomPadding(expandedRef.current));
    return () => { fitRef.current = null; overlays.forEach((overlay) => overlay.setMap(null)); lines.forEach((line) => line.setMap(null)); };
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
    // Softened like Grab's light map: muted colours, blue water kept.
    if (tiles) tiles.style.filter = "saturate(.35) brightness(1.08) contrast(.9)";
    const line = traffic?.path ?? path;
    const segments = traffic ? trafficSegments(traffic.path, traffic.intervals) : [{ points: path, speed: "NORMAL" as const }];
    for (const segment of segments) L.polyline(segment.points, { color: TRAFFIC_CASING[segment.speed], weight: 9, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(map);
    for (const segment of segments) L.polyline(segment.points, { color: TRAFFIC_COLORS[segment.speed], weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(map);
    const travel = traffic?.durationSeconds ? traffic.durationSeconds / 60 : props.quote.averageDurationMinutes ?? props.quote.durationSeconds / 60;
    const icon = (html: string) => L.divIcon({ className: "", html, iconSize: [0, 0] });
    const middle = routeMiddle(line);
    L.marker(middle.point, { icon: icon(grabBubble(travel, props.quote.distanceMeters / 1000, middle.placement)), interactive: false }).addTo(map);
    L.marker(dropoff, { icon: icon(grabDropoff(shortPlace(props.dropoff))), interactive: false, zIndexOffset: 500 }).addTo(map);
    L.marker(pickup, { icon: icon(grabPickup(shortPlace(props.pickup))), interactive: false, zIndexOffset: 1000 }).addTo(map);
    const routeBounds = L.latLngBounds(line);
    let first = true;
    fitRef.current = (bottom) => {
      // Jump on first draw; afterwards glide to the new framing, like Grab.
      const options = { paddingTopLeft: [70, mapTopPadding(expandedRef.current)], paddingBottomRight: [110, bottom] };
      if (first) { map.fitBounds(routeBounds, options); first = false; }
      else map.flyToBounds(routeBounds, { ...options, duration: 0.45, easeLinearity: 0.3 });
    };
    fitRef.current(mapBottomPadding(expandedRef.current));
    return () => { fitRef.current = null; map.remove(); };
  }, [leafletReady, props.quote, props.pickup, props.dropoff, props.date, props.time, traffic]);

  // Bottom sheet, phone only: collapsed (map 70%) or expanded. The sheet is
  // moved with transform alone, written straight to the DOM while the finger
  // moves (no React re-render per frame), then springs to the nearest stop.
  // Swiping anywhere on the sheet drags it; when expanded, the list scrolls
  // first and the sheet only follows a downward swipe from the list's top.
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const setSheet = useCallback((open: boolean, animate = true) => {
    const sheet = sheetRef.current;
    expandedRef.current = open;
    setExpanded(open);
    if (!sheet) return;
    sheet.style.transition = animate ? "transform .42s cubic-bezier(.22,1,.36,1)" : "none";
    sheet.style.setProperty("--sheet-y", open ? "0px" : `${collapsedOffset()}px`);
    if (!open && listRef.current) listRef.current.scrollTop = 0;
    // Once the sheet settles, re-frame the route in the map that is still visible.
    window.clearTimeout(refitTimer.current);
    refitTimer.current = window.setTimeout(() => fitRef.current?.(mapBottomPadding(open)), animate ? 380 : 0);
  }, []);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    setSheet(false, false);
    const onResize = () => setSheet(expandedRef.current, false);
    window.addEventListener("resize", onResize);

    let startY = 0, startT = 0, startOffset = 0, lastY = 0, lastT = 0, velocity = 0, dragging = false, decided = false, frame = 0;
    const offsetNow = () => (expandedRef.current ? 0 : collapsedOffset());
    const apply = (y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sheet.style.setProperty("--sheet-y", `${y}px`));
    };
    const onStart = (event: TouchEvent) => {
      if (window.innerWidth >= 1024 || event.touches.length !== 1) return;
      startY = lastY = event.touches[0].clientY;
      startT = lastT = event.timeStamp;
      startOffset = offsetNow();
      velocity = 0; dragging = false; decided = false;
    };
    const onMove = (event: TouchEvent) => {
      if (window.innerWidth >= 1024 || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const dy = y - startY;
      if (!decided) {
        if (Math.abs(dy) < 6) return;
        decided = true;
        const listAtTop = (listRef.current?.scrollTop ?? 0) <= 0;
        // Collapsed: any vertical swipe moves the sheet. Expanded: only a
        // downward swipe that starts with the list scrolled to the top.
        dragging = !expandedRef.current || (dy > 0 && listAtTop);
        if (dragging) sheet.style.transition = "none";
      }
      if (!dragging) return;
      event.preventDefault();
      const max = collapsedOffset();
      let next = startOffset + dy;
      // Rubber-band past either end.
      if (next < 0) next = next / 4;
      if (next > max) next = max + (next - max) / 4;
      const dt = Math.max(1, event.timeStamp - lastT);
      velocity = (y - lastY) / dt;
      lastY = y; lastT = event.timeStamp;
      apply(next);
    };
    const onEnd = (event: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      const max = collapsedOffset();
      const current = startOffset + (lastY - startY);
      // A flick (fast, or a quick short swipe) decides by direction; a slow
      // drag by the halfway point.
      const moved = lastY - startY;
      const quick = Math.abs(moved) > 30 && event.timeStamp - startT < 300;
      const open = Math.abs(velocity) > 0.3 || quick ? moved < 0 : current < max / 2;
      setSheet(open);
    };
    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [setSheet]);

  // Phones: the results screen fills the screen, so the page behind it must
  // not scroll (a stray swipe would drag the whole screen up).
  useEffect(() => {
    if (window.innerWidth >= 1024) return;
    const html = document.documentElement, body = document.body;
    const previous = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior];
    html.style.overflow = "hidden"; body.style.overflow = "hidden"; html.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => { [html.style.overflow, body.style.overflow, html.style.overscrollBehavior] = previous; };
  }, []);

  const disabled = !props.quote || props.loading || !selected || selected.fits === false || props.checkoutReady === false;

  return <section className="fixed inset-0 z-30 overflow-hidden overscroll-none bg-white lg:relative lg:inset-auto lg:z-auto lg:h-[100svh]" aria-live="polite">
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
      <button type="button" onClick={props.onEditTrip ?? props.onEdit} className="absolute left-1/2 top-[max(16px,env(safe-area-inset-top))] z-10 flex h-11 max-w-[calc(100%-140px)] -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 text-[16px] font-medium text-[#1C1C1C] shadow-md" aria-label="Edit passengers, date and time">
        <Users size={20} className="shrink-0 text-brand" aria-hidden="true" /><span className="truncate">{passengers} · {pillLabel(props.date, props.time)}</span>
      </button>
    </div>

    {/* Sheet */}
    <div ref={sheetRef} className="absolute inset-x-0 bottom-0 top-[35svh] z-10 flex flex-col rounded-t-[20px] bg-white shadow-[0_-4px_16px_rgba(0,0,0,.08)] will-change-transform [transform:translate3d(0,var(--sheet-y,0px),0)] lg:inset-y-0 lg:left-0 lg:right-auto lg:top-0 lg:w-[460px] lg:rounded-none lg:[transform:none]">
      {/* Drag (or tap) the handle to pull the list up over the map and back down. */}
      <button
        type="button"
        aria-label={expanded ? "Show more map" : "Show all cars"}
        aria-expanded={expanded}
        onClick={() => setSheet(!expanded)}
        className="flex h-6 w-full shrink-0 items-center justify-center lg:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-[#D9D9D9]" aria-hidden="true" />
      </button>
      <div ref={listRef} className={`flex-1 overscroll-contain px-4 pb-[150px] pt-0 lg:overflow-y-auto lg:pt-3 ${expanded ? "overflow-y-auto" : "overflow-hidden"}`}>

        {props.error ? <div className="mb-3 rounded-2xl bg-orange-50 p-4 text-sm text-[#6D3700]">
          <strong className="block">We couldn&apos;t calculate this route.</strong>
          <span>Please check your pickup and destination.</span>
          <div className="mt-3 flex gap-2"><button onClick={props.onEdit} className="min-h-11 rounded-full bg-white px-4 font-medium">Edit trip</button><button onClick={props.onRetry} className="min-h-11 rounded-full bg-brand px-4 font-medium text-white">Try again</button></div>
        </div> : null}

        <ul className="grid gap-3 pt-2.5">
          {props.vehicles.map((item) => {
            const active = item.id === selected?.id;
            const off = !props.quote || item.fits === false;
            const badge = item.fits === false ? null : item.id === cheapest?.id ? "best" : item.popular ? "popular" : null;
            return <li key={item.id}>
              <button type="button" disabled={off} aria-pressed={active} onClick={() => props.onSelectVehicle(item.id)} className={`relative grid w-full grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-[#FF8A05] bg-white" : "border-transparent enabled:hover:bg-[#FAFAFA]"}`}>
                <span className="grid h-14 place-items-center">{item.image ? <Image src={item.image} alt="" width={184} height={156} unoptimized className={`max-h-14 w-full object-contain ${item.id === "comfort_suv" ? "scale-110" : ""}`} /> : <CarFront size={44} className="text-[#9A9A9A]" aria-hidden="true" />}</span>
                <span className="min-w-0">
                  <strong className="block text-[17px] font-semibold leading-tight text-[#1C1C1C]">{item.name}</strong>
                  <span className="mt-1 flex items-center gap-1.5 text-[15px] text-[#6B6B6B]">
                    {item.passengers !== undefined && <><span>{item.passengers}</span><Users size={18} className="text-[#1C1C1C]" aria-label="passengers" /></>}
                    {item.bags !== undefined && <><span className="ml-2">{item.bags}</span><Luggage size={18} className="text-[#1C1C1C]" aria-label="bags" /></>}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.name} details`}
                      onClick={(e) => { e.stopPropagation(); setInfoId(item.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setInfoId(item.id); } }}
                      className="-m-2 ml-0 grid size-9 place-items-center rounded-full text-[#9A9A9A] hover:text-[#1C1C1C]"
                    ><CircleHelp size={18} aria-hidden="true" /></span>
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
                  {props.returnTrip && <span className="mt-0.5 block text-[12px] text-[#8A8A8A]">Round trip</span>}
                </span>
              </button>
            </li>;
          })}
        </ul>

        {/* Free cancellation up to 24 hours before pickup (Transfeero style). */}
        {props.quote && (cancelDeadlineAt(props.date, props.time) > Date.now() ? <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#BFE8CF] bg-gradient-to-br from-[#F1FBF5] to-[#E6F7EE] p-4 shadow-[0_4px_18px_rgba(22,120,70,.08)]">
          <CancelCalendar3D size={56} className="shrink-0" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-[#17563A]">FREE Cancellation 24H <span className="rounded-full bg-[#D3F2E0] px-2.5 py-0.5 text-[13px] font-semibold text-[#17563A]">24h</span></p>
            <p className="mt-1.5 text-[14px] leading-6 text-[#2B6A4D]">Book today, lock the price. You can cancel for free until <strong className="font-semibold text-[#17563A]">{cancelDeadline(props.date, props.time)}</strong> and get a full refund.</p>
          </div>
        </div> : <div className="mt-6 rounded-2xl border border-[#E6E6E6] bg-[#F7F7F7] p-4">
          <p className="text-[17px] font-semibold text-[#1C1C1C]">Non-refundable</p>
          <p className="mt-1.5 text-[14px] leading-6 text-[#4A4A4A]">Pickup is less than 24 hours away, so this booking can&apos;t be cancelled for free.</p>
        </div>)}
      </div>

    </div>

    {/* Bottom bar */}
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[#EEEEEE] bg-white px-4 lg:right-auto lg:w-[460px] pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-2"><span className="text-[15px] text-[#4A4A4A]">Total</span><strong className="whitespace-nowrap text-[17px] font-semibold text-[#1C1C1C]">{money(total)}</strong>{currency !== "THB" && <span className="whitespace-nowrap text-[13px] text-[#8A8A8A]">~{thb(total)}</span>}</p>
        <button type="button" onClick={() => setDetailsOpen(true)} className="flex shrink-0 items-center gap-1.5 text-[15px] text-[#1C1C1C]"><Info size={18} aria-hidden="true" />Price and route</button>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        {props.onExtrasChange && <button type="button" onClick={() => setExtrasOpen(true)} aria-label="Additional services" className="relative grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
          <Plus size={24} strokeWidth={2.5} aria-hidden="true" />
          {extrasCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-white bg-[#1C1C1C] text-[11px] font-semibold">{extrasCount}</span>}
        </button>}
      <button disabled={disabled} onClick={props.onContinue} className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-full bg-brand text-[17px] font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50">Continue</button>
      </div>
    </div>

    {/* Additional services ("+" beside Continue), Grab style. */}
    <DialogPrimitive.Root open={extrasOpen} onOpenChange={setExtrasOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="font-home fixed inset-x-0 bottom-0 z-[81] flex max-h-[85dvh] flex-col rounded-t-[20px] bg-white text-[#1C1C1C] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
          <div className="flex items-center justify-between px-5 pt-5">
            <DialogPrimitive.Title className="text-[24px] font-semibold leading-tight">Additional services</DialogPrimitive.Title>
            <DialogPrimitive.Close className="grid size-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Close"><X size={24} /></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="px-5 pt-1 text-[14px] text-[#6B6B6B]">Add extras to your ride. Your driver will have them ready.</DialogPrimitive.Description>
          <ul className="flex-1 overflow-y-auto px-5 pb-2 pt-2">
            <li className="flex items-center gap-4 border-b border-[#EEEEEE] py-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF3E6] text-brand"><Baby size={22} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[16px] font-medium">Child seat</span><span className="block text-[13px] text-[#6B6B6B]">For babies and young children, up to {maxSeats}</span></span>
              <span className="flex items-center gap-3">
                <button type="button" aria-label="Remove child seat" disabled={seats === 0} onClick={() => setExtras({ childSeats: seats - 1, exchangeStop: exchange })} className="grid size-8 place-items-center rounded-full border border-[#D9D9D9] disabled:opacity-40"><Minus size={16} aria-hidden="true" /></button>
                <span className="w-4 text-center text-[16px] font-medium" aria-live="polite">{seats}</span>
                <button type="button" aria-label="Add child seat" disabled={seats >= maxSeats} onClick={() => setExtras({ childSeats: seats + 1, exchangeStop: exchange })} className="grid size-8 place-items-center rounded-full border border-[#D9D9D9] disabled:opacity-40"><Plus size={16} aria-hidden="true" /></button>
              </span>
            </li>
            <li>
              <label className="flex cursor-pointer items-center gap-4 py-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF3E6] text-brand"><Banknote size={22} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[16px] font-medium">Currency exchange stop</span><span className="block text-[13px] text-[#6B6B6B]">A short stop at an exchange counter on the way</span></span>
                <input type="checkbox" checked={exchange} onChange={(e) => setExtras({ childSeats: seats, exchangeStop: e.target.checked })} className="size-5 accent-[#FF8A05]" />
              </label>
            </li>
          </ul>
          <div className="px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
            <DialogPrimitive.Close className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-[17px] font-semibold text-white hover:bg-brand-hover">Done</DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>

    {/* Vehicle details ("?" on a car card), Transfeero style. */}
    <DialogPrimitive.Root open={Boolean(info)} onOpenChange={(open) => { if (!open) setInfoId(null); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="font-home fixed inset-x-0 bottom-0 z-[81] flex max-h-[85dvh] flex-col rounded-t-[20px] bg-white text-[#1C1C1C] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
          {info && <>
            <div className="flex items-center justify-between px-5 pt-5">
              <DialogPrimitive.Title className="text-[28px] font-semibold leading-tight">Details</DialogPrimitive.Title>
              <DialogPrimitive.Close className="grid size-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Close"><X size={24} /></DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E6E6] py-4">
                <p className="text-[17px] font-medium">Class: {info.name}</p>
                {info.id === cheapest?.id && <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF7EE] px-2.5 py-0.5 text-[14px] font-medium text-[#2E7D32]"><Lightbulb size={14} aria-hidden="true" />Best value</span>}
                {info.popular && info.id !== cheapest?.id && <span className="inline-flex items-center gap-1 rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-[14px] font-medium text-[#B3261E]"><Flame size={14} aria-hidden="true" />Most popular</span>}
              </div>
              <DialogPrimitive.Description className="sr-only">Vehicle details and price for {info.name}</DialogPrimitive.Description>
              <h3 className="mt-5 text-[17px] font-medium">Vehicle details</h3>
              <ul className="mt-3 grid gap-3 text-[16px] text-[#4A4A4A]">
                <li className="flex items-center gap-3"><CarFront size={18} aria-hidden="true" />{VEHICLE_MODELS[info.id] ?? info.tagline}</li>
                {info.passengers !== undefined && <li className="flex items-center gap-3"><Users size={18} aria-hidden="true" />Up to {info.passengers} passengers</li>}
                {info.bags !== undefined && <li className="flex items-center gap-3"><Luggage size={18} aria-hidden="true" />Up to {info.bags} checked bags + {info.bags} carry-ons</li>}
              </ul>
              <h3 className="mt-6 text-[17px] font-medium">Included</h3>
              <ul className="mt-3 grid gap-2.5 text-[16px] text-[#4A4A4A]">
                {["Private car and driver for your group", "Door-to-door", "Fixed price agreed before you book", ...lines.included].map((line) => <li key={line} className="flex items-center gap-3"><Check size={18} className="shrink-0" aria-hidden="true" />{line}</li>)}
              </ul>
              {lines.excluded.length > 0 && <>
                <h3 className="mt-6 text-[17px] font-medium">Excluded</h3>
                <ul className="mt-3 grid gap-2.5 text-[16px] text-[#4A4A4A]">
                  {lines.excluded.map((line) => <li key={line} className="flex items-center gap-3"><X size={18} className="shrink-0" aria-hidden="true" />{line}</li>)}
                </ul>
              </>}
              <h3 className="mt-6 text-[17px] font-medium">Price breakdown</h3>
              {props.returnTrip && props.priceBreakdown?.[info.id] ? <>
                <p className="mt-3 flex justify-between text-[16px] text-[#4A4A4A]"><span>Outward</span><span>{money(props.priceBreakdown[info.id].outbound)}</span></p>
                <p className="mt-2 flex justify-between text-[16px] text-[#4A4A4A]"><span>Return</span><span>{money(props.priceBreakdown[info.id].return)}</span></p>
              </> : <p className="mt-3 flex justify-between text-[16px] text-[#4A4A4A]"><span>Outward</span><span>{money(info.price)}</span></p>}
              <p className="mt-3 flex justify-between border-t border-[#E6E6E6] pt-3 text-[16px]"><span>Total</span><span className="font-medium">{money(props.priceBreakdown?.[info.id]?.total ?? info.price)}</span></p>
            </div>
            <div className="grid gap-3 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
              <DialogPrimitive.Close className="h-12 rounded-full border border-[#D9D9D9] text-[16px] font-medium">Close</DialogPrimitive.Close>
              <button
                type="button"
                disabled={!props.quote || info.fits === false || props.checkoutReady === false}
                onClick={() => { const id = info.id; setInfoId(null); props.onSelectVehicle(id); props.onContinue(); }}
                className="h-12 rounded-full bg-brand text-[16px] font-semibold text-white disabled:opacity-50"
              >
                {info.fits === false ? "Too small for your group" : "Continue"}
              </button>
            </div>
          </>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>

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
              {lines.included.map((line) => <p key={line} className="mt-2 flex items-center gap-2 text-[14px] text-[#6B6B6B]"><Check size={16} aria-hidden="true" />{line}</p>)}
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

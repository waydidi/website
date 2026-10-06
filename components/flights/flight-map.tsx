"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps is loaded at runtime without types */
import { useEffect, useRef, useState } from "react";

type Pt = { lat: number | null; lon: number | null; iata: string | null };
type Position = { lat: number; lon: number; track: number | null } | null;

// Same loader as the trip page: the key comes from /api/maps/config, the script is added once.
function loadMaps(onReady: () => void) {
  const w = window as any;
  if (w.google?.maps) { onReady(); return; }
  const existing = document.querySelector<HTMLScriptElement>("script[data-waydidi-google-maps]");
  if (existing) { existing.addEventListener("load", onReady, { once: true }); return; }
  fetch("/api/maps/config", { cache: "no-store" }).then((r) => r.json()).then(({ apiKey }: { apiKey?: string }) => {
    if (!apiKey) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.dataset.waydidiGoogleMaps = "true";
    script.addEventListener("load", onReady, { once: true });
    document.head.appendChild(script);
  }).catch(() => undefined);
}

const PLANE = "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";

/** Route between the two airports (curved like a flight path) and the plane's last reported position. */
export function FlightMap({ from, to, position }: { from: Pt; to: Pt; position: Position }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { loadMaps(() => setReady(true)); }, []);

  useEffect(() => {
    const maps = (window as any).google?.maps;
    if (!ready || !ref.current || !maps || from.lat === null || from.lon === null || to.lat === null || to.lon === null) return;
    const a = { lat: from.lat, lng: from.lon }, b = { lat: to.lat, lng: to.lon };
    const map = new maps.Map(ref.current, { disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "cooperative" });
    const bounds = new maps.LatLngBounds(); bounds.extend(a); bounds.extend(b);
    if (position) bounds.extend({ lat: position.lat, lng: position.lon });
    map.fitBounds(bounds, 48);
    new maps.Polyline({ map, path: [a, b], geodesic: true, strokeColor: "#FE8B05", strokeOpacity: 0.9, strokeWeight: 3 });
    for (const [p, label] of [[a, from.iata], [b, to.iata]] as const) {
      new maps.Marker({ map, position: p, label: { text: label ?? "", color: "#211726", fontWeight: "700", fontSize: "12px" },
        icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#FFFFFF", fillOpacity: 1, strokeColor: "#FE8B05", strokeWeight: 3, labelOrigin: new maps.Point(0, -2.6) } });
    }
    if (position) new maps.Marker({ map, position: { lat: position.lat, lng: position.lon }, zIndex: 10,
      icon: { path: PLANE, fillColor: "#FE8B05", fillOpacity: 1, strokeColor: "#FFFFFF", strokeWeight: 1, scale: 1.5, rotation: position.track ?? 0, anchor: new maps.Point(12, 12) } });
  }, [ready, from.lat, from.lon, to.lat, to.lon, from.iata, to.iata, position]);

  if (from.lat === null || to.lat === null) return null;
  return <div ref={ref} className="mt-5 h-[220px] w-full overflow-hidden rounded-xl bg-[#EAF1F4] sm:h-[280px]" aria-label="Flight route map" role="img" />;
}

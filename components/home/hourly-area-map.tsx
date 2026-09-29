"use client";

import { useEffect, useRef, useState } from "react";
import { grabDropoff, grabPickup, loadLeaflet, shortPlace } from "@/components/booking-results-map";
import type { HourlyArea } from "@/lib/hourly-areas-data";

type Point = { lat: number; lng: number; text: string };

// By-the-hour results map: the service area's real border in Waydidi orange
// (70% line, light tint inside), with pickup and drop-off pins.
export function HourlyAreaMap({ area, pickup, dropoff }: { area: HourlyArea; pickup: Point | null; dropoff: Point | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { loadLeaflet().then(() => setReady(true)).catch(() => undefined); }, []);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!ready || !L || !box.current) return;
    const map = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap · Boundaries: geoBoundaries" }).addTo(map);
    const shape = L.polygon(area.polygons, { color: "#FF8A05", opacity: 0.7, weight: 3, fillColor: "#FF8A05", fillOpacity: 0.12, lineJoin: "round" }).addTo(map);
    const icon = (html: string) => L.divIcon({ className: "", html, iconSize: [0, 0] });
    const bounds = shape.getBounds();
    if (pickup) { L.marker([pickup.lat, pickup.lng], { icon: icon(grabPickup(shortPlace(pickup.text))), interactive: false, zIndexOffset: 1000 }).addTo(map); bounds.extend([pickup.lat, pickup.lng]); }
    if (dropoff) { L.marker([dropoff.lat, dropoff.lng], { icon: icon(grabDropoff(shortPlace(dropoff.text))), interactive: false, zIndexOffset: 500 }).addTo(map); bounds.extend([dropoff.lat, dropoff.lng]); }
    map.fitBounds(bounds, { padding: [36, 36] });
    return () => { map.remove(); };
  }, [ready, area, pickup, dropoff]);
  return <div ref={box} role="img" aria-label={`${area.name} service area map`} className="h-[260px] w-full overflow-hidden rounded-2xl bg-[#EEF1F4] sm:h-[340px]" />;
}

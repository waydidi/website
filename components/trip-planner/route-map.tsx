"use client";

import { useEffect, useRef, useState } from "react";
import { loadMaps } from "@/components/account/place-autocomplete";

export type MapPoint = { id: string; lat: number; lng: number; label: string; title: string; kind: "pickup" | "stop" | "end" | "driver"; muted?: boolean };

/** Numbered stops and the route line on Google Maps. Clicking a marker reports its id. */
export function RouteMap({ points, selected, onSelect, className = "h-[360px]" }: { points: MapPoint[]; selected?: string | null; onSelect?: (id: string) => void; className?: string }) {
  const node = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers = useRef<any[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let active = true;
    void loadMaps().then((ok) => {
      if (!active) return;
      if (ok && node.current && !map.current) map.current = new window.google.maps.Map(node.current, { center: { lat: 13.75, lng: 100.5 }, zoom: 6, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      setReady(ok);
    });
    return () => { active = false; };
  }, []);

  const key = JSON.stringify(points) + (selected ?? "");
  useEffect(() => {
    const g = window.google?.maps;
    if (!ready || !map.current || !g) return;
    for (const l of layers.current) l.setMap(null);
    layers.current = [];
    if (!points.length) return;
    const bounds = new g.LatLngBounds();
    const route = points.filter((p) => p.kind !== "driver" && !p.muted);
    layers.current.push(new g.Polyline({ map: map.current, path: route.map((p) => ({ lat: p.lat, lng: p.lng })), strokeColor: "#FF8A05", strokeOpacity: 0.9, strokeWeight: 4 }));
    for (const p of points) {
      const isSel = p.id === selected;
      const color = p.kind === "driver" ? "#0E9F6E" : p.muted ? "#94A3B8" : p.kind === "stop" ? "#FF8A05" : "#211726";
      const marker = new g.Marker({
        map: map.current, position: { lat: p.lat, lng: p.lng }, title: p.title, zIndex: isSel ? 999 : p.kind === "driver" ? 998 : undefined,
        label: { text: p.label, color: "#fff", fontSize: "12px", fontWeight: "700" },
        icon: { path: g.SymbolPath.CIRCLE, scale: isSel ? 15 : 12, fillColor: color, fillOpacity: 1, strokeColor: isSel ? "#211726" : "#fff", strokeWeight: isSel ? 3 : 2 },
      });
      marker.addListener("click", () => onSelectRef.current?.(p.id));
      layers.current.push(marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    }
    if (points.length === 1) { map.current.setCenter({ lat: points[0].lat, lng: points[0].lng }); map.current.setZoom(13); }
    else map.current.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  return <div className={`relative overflow-hidden rounded-2xl bg-slate-100 ${className}`}>
    <div ref={node} className="absolute inset-0" />
    {ready === false && <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-slate-500">The map needs a Google Maps key. Times still use estimates.</div>}
  </div>;
}

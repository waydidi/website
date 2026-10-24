"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Landmark, Map as MapIcon, MapPin, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { loadMaps } from "@/lib/google-places";

/** One pin on the trip map with its card: the pickup (flag) or a place (photo, name, address). */
export type MapPlace = { id: string; number?: number; kind: "pickup" | "stop"; lat: number; lng: number; name: string; photo: string | null; subtitle: string; detail: string };
type Words = { viewMaps: string; mapsTitle: string; closeLabel: string; myLocation: string; mapNeedsKey: string };

// Map pins drawn as SVG: a blue flag for the pickup, a green landmark for each place (bigger when its card is showing).
const pin = (fill: string, inner: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54"><path d="M22 52s18-16.8 18-30A18 18 0 0 0 4 22c0 13.2 18 30 18 30z" fill="${fill}" stroke="#fff" stroke-width="3"/>${inner}</svg>`)}`;
const FLAG = pin("#2563EB", `<path d="M16 32V12m0 1h12l-3 4.5 3 4.5H16" fill="#fff" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>`);
const placePin = (number: number) => pin("#FE8B05", `<text x="22" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#21140a">${number}</text>`);

/**
 * "View maps": the whole trip on a full-screen map, like Klook's. Pins for the pickup and each place; the cards at the
 * bottom (photo, name, address) swipe sideways and move the map to that place, and tapping a pin brings up its card.
 */
export function TripMap({ places, words }: { places: MapPlace[]; words: Words }) {
  const [open, setOpen] = useState(false);
  if (!places.length) return null;
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className="mt-5 flex min-h-tap w-full items-center justify-center gap-2 rounded-xl border border-slate-500 bg-white px-4 py-3 text-[17px] font-bold text-plum hover:bg-canvas">
      <MapIcon size={20} aria-hidden />{words.viewMaps}
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[60] bg-slate-100 outline-none">
        <Dialog.Title className="sr-only">{words.mapsTitle}</Dialog.Title>
        {open && <MapBody places={places} words={words} />}
        <Dialog.Close aria-label={words.closeLabel} className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] grid size-12 place-items-center rounded-full bg-white text-plum shadow-lg"><X size={24} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function MapBody({ places, words }: { places: MapPlace[]; words: Words }) {
  const node = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const me = useRef<any>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [active, setActive] = useState<number | null>(null); // the card showing; null until staff or the customer moves

  // The map, every pin, and the whole trip in view (leaving room for the cards).
  useEffect(() => {
    let live = true;
    void loadMaps().then((ok) => {
      if (!live) return;
      const g = window.google?.maps;
      if (ok && g && node.current && !map.current) {
        map.current = new g.Map(node.current, { center: { lat: places[0].lat, lng: places[0].lng }, zoom: 12, disableDefaultUI: true, clickableIcons: false, gestureHandling: "greedy" });
        const bounds = new g.LatLngBounds();
        markers.current = places.map((p, i) => {
          const marker = new g.Marker({ map: map.current, position: { lat: p.lat, lng: p.lng }, title: p.name, icon: { url: p.kind === "pickup" ? FLAG : placePin(p.number ?? places.slice(0, i + 1).filter((x) => x.kind === "stop").length), scaledSize: new g.Size(40, 49), anchor: new g.Point(20, 49) } });
          marker.addListener("click", () => { setActive(i); (strip.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); });
          bounds.extend({ lat: p.lat, lng: p.lng });
          return marker;
        });
        if (places.length === 1) map.current.setZoom(14);
        else map.current.fitBounds(bounds, { top: 90, right: 40, bottom: 230, left: 40 });
      }
      setReady(ok);
    });
    return () => {
      live = false;
      markers.current.forEach((marker) => { window.google?.maps?.event?.clearInstanceListeners(marker); marker.setMap(null); });
      markers.current = [];
      me.current?.setMap(null);
      map.current = null;
    };
  }, [places]);

  // The card showing: its pin grows and the map moves to it.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !map.current || active == null) return;
    markers.current.forEach((m, i) => {
      const big = i === active;
      m.setIcon({ url: places[i].kind === "pickup" ? FLAG : placePin(places[i].number ?? places.slice(0, i + 1).filter((x) => x.kind === "stop").length), scaledSize: new g.Size(big ? 52 : 40, big ? 64 : 49), anchor: new g.Point(big ? 26 : 20, big ? 64 : 49) });
      m.setZIndex(big ? 999 : undefined);
    });
    map.current.panTo({ lat: places[active].lat, lng: places[active].lng });
    map.current.panBy(0, 90); // keep the pin above the cards
  }, [active, places]);

  const showCard = (i: number) => { const el = strip.current?.children[i] as HTMLElement | undefined; el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); };
  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    const cards = [...el.children] as HTMLElement[];
    const i = cards.reduce((best, c, k) => Math.abs(c.offsetLeft + c.offsetWidth / 2 - middle) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - middle) ? k : best, 0);
    if (i !== active && (active != null || el.scrollLeft > 8)) setActive(i);
  };
  const locate = () => navigator.geolocation?.getCurrentPosition((pos) => {
    const g = window.google?.maps;
    if (!g || !map.current) return;
    const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    me.current?.setMap(null);
    me.current = new g.Marker({ map: map.current, position: at, icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: "#2563EB", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } });
    map.current.panTo(at);
  }, () => undefined, { enableHighAccuracy: true, timeout: 10_000 });

  return <>
    <div ref={node} className="absolute inset-0" />
    {ready === false && <p className="absolute inset-x-6 top-1/3 text-center text-[15px] text-slate-500">{words.mapNeedsKey}</p>}
    {ready && <button type="button" onClick={locate} aria-label={words.myLocation} className="absolute bottom-[200px] right-4 grid size-12 place-items-center rounded-full bg-white text-plum shadow-lg"><Crosshair size={24} /></button>}
    <div ref={strip} onScroll={onScroll} className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {places.map((p, i) => <button key={p.id} type="button" onClick={() => { setActive(i); showCard(i); }} aria-current={i === active ? "true" : undefined}
        className={`flex min-h-[132px] w-[86%] max-w-[520px] shrink-0 snap-center items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-xl ring-2 transition ${i === active ? "ring-brand" : "ring-transparent"}`}>
        {p.photo ? <img src={p.photo} alt="" className="size-24 shrink-0 rounded-xl object-cover" />
          : <span aria-hidden className={`grid size-24 shrink-0 place-items-center rounded-xl ${p.kind === "pickup" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-700"}`}>{p.kind === "pickup" ? <MapPin size={30} /> : <Landmark size={30} />}</span>}
        <span className="min-w-0">
          <span className="block text-[18px] font-bold leading-6 text-plum">{p.name}</span>
          <span className="mt-1 block text-[15px] text-slate-700">{p.subtitle}</span>
          {p.detail && <span className="mt-1 line-clamp-2 block text-[14px] leading-5 text-slate-500">{p.detail}</span>}
        </span>
      </button>)}
    </div>
  </>;
}

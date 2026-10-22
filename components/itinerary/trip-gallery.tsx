"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TripPhoto } from "@/lib/trip-photos";

type Words = { galleryLabel: string; photoOf: string; prevPhoto: string; nextPhoto: string };
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** Swipeable photos of the trip's stops: one per screen, dots and a counter, arrows on larger screens. */
export function TripGallery({ photos, words }: { photos: TripPhoto[]; words: Words }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const go = (i: number) => { const el = strip.current; if (el) el.scrollTo({ left: Math.max(0, Math.min(photos.length - 1, i)) * el.clientWidth, behavior: "smooth" }); };
  const onScroll = () => { const el = strip.current; if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth)); };
  if (!photos.length) return null;
  return <section aria-roledescription="carousel" aria-label={words.galleryLabel} className="relative bg-slate-900 sm:overflow-hidden sm:rounded-card">
    <div ref={strip} onScroll={onScroll} className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:aspect-[2/1] [&::-webkit-scrollbar]:hidden">
      {photos.map((p, i) => <figure key={p.src} aria-roledescription="slide" aria-label={fill(words.photoOf, { n: i + 1, total: photos.length })} className="relative h-full w-full shrink-0 snap-center">
        <img src={p.src} alt={p.stop} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
        <figcaption className="absolute left-3 top-3 max-w-[70%] truncate rounded-full bg-black/55 px-3 py-1 text-[13px] font-semibold text-white">{p.stop}</figcaption>
      </figure>)}
    </div>
    {photos.length > 1 && <>
      <p aria-live="polite" className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-bold tabular-nums text-white">{index + 1} / {photos.length}</p>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
        {photos.slice(0, 12).map((p, i) => <span key={p.src} className={`size-2 rounded-full ${i === Math.min(index, 11) ? "bg-white" : "bg-white/50"}`} />)}
      </div>
      <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={words.prevPhoto} className="absolute left-3 top-1/2 hidden size-tap -translate-y-1/2 place-items-center rounded-full bg-white/90 text-plum shadow disabled:opacity-0 sm:grid"><ChevronLeft size={22} /></button>
      <button type="button" onClick={() => go(index + 1)} disabled={index === photos.length - 1} aria-label={words.nextPhoto} className="absolute right-3 top-1/2 hidden size-tap -translate-y-1/2 place-items-center rounded-full bg-white/90 text-plum shadow disabled:opacity-0 sm:grid"><ChevronRight size={22} /></button>
    </>}
  </section>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { TripPhoto } from "@/lib/trip-photos";

type Words = { galleryLabel: string; galleryButton: string; photoOf: string; prevPhoto: string; nextPhoto: string; closeLabel: string };
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const SLIDE_MS = 5000;

/**
 * The trip's photos at the top of the page, like a story: each one slowly zooms in, then the next fades in, with one
 * loading bar per photo filling at the bottom. Swipe or the arrows change photo; "Gallery" shows them all. With reduced
 * motion the photos neither zoom nor change by themselves.
 */
export function TripGallery({ photos, words }: { photos: TripPhoto[]; words: Words }) {
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  const touch = useRef<number | null>(null);
  const count = photos.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);
  useEffect(() => { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (still || count < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, still, count]);
  if (!count) return null;
  return <section aria-roledescription="carousel" aria-label={words.galleryLabel} className="relative aspect-[4/3] overflow-hidden bg-slate-900 sm:aspect-[2/1]"
    onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
    onTouchEnd={(e) => { const start = touch.current; touch.current = null; if (start == null) return; const dx = e.changedTouches[0].clientX - start; if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1)); }}>
    {photos.map((p, i) => <figure key={p.src} aria-roledescription="slide" aria-label={fill(words.photoOf, { n: i + 1, total: count })} aria-hidden={i !== index}
      className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}>
      <img src={p.src} alt={p.stop} loading={i === 0 ? "eager" : "lazy"}
        className={`h-full w-full object-cover ${i === index && !still && count > 1 ? "animate-[trip-photo-zoom_5s_linear_forwards]" : ""}`} key={i === index ? `${p.src}-${index}` : p.src} />
    </figure>)}
    <Sheet>
      <SheetTrigger className="absolute bottom-14 right-3 inline-flex min-h-tap items-center gap-2 rounded-xl bg-black/60 px-4 text-[16px] font-semibold text-white backdrop-blur-sm"><Images size={19} aria-hidden />{words.galleryButton}</SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="mx-auto h-[92dvh] max-w-[880px] gap-0 rounded-t-card p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <SheetTitle className="text-[19px] font-bold text-plum">{words.galleryLabel}</SheetTitle>
          <SheetClose aria-label={words.closeLabel} className="grid size-tap place-items-center rounded-full text-plum hover:bg-canvas"><X size={22} /></SheetClose>
        </div>
        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {photos.map((p) => <figure key={p.src}><img src={p.src} alt={p.stop} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /><figcaption className="mt-1 text-[14px] font-semibold text-slate-700">{p.stop}</figcaption></figure>)}
        </div>
      </SheetContent>
    </Sheet>
    {count > 1 && <>
      <div aria-hidden className="absolute inset-x-3 bottom-8 flex gap-1.5">
        {photos.map((p, i) => <span key={p.src} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/40">
          <span key={i === index ? index : "bar"} className={`block h-full rounded-full bg-white ${i < index || (still && i === index) ? "w-full" : i === index ? "w-0 animate-[trip-photo-progress_5s_linear_forwards]" : "w-0"}`} />
        </span>)}
      </div>
      <p className="sr-only" aria-live="polite">{fill(words.photoOf, { n: index + 1, total: count })}</p>
      <button type="button" onClick={() => go(index - 1)} aria-label={words.prevPhoto} className="absolute left-3 top-1/2 hidden size-tap -translate-y-1/2 place-items-center rounded-full bg-white/90 text-plum shadow sm:grid"><ChevronLeft size={22} /></button>
      <button type="button" onClick={() => go(index + 1)} aria-label={words.nextPhoto} className="absolute right-3 top-1/2 hidden size-tap -translate-y-1/2 place-items-center rounded-full bg-white/90 text-plum shadow sm:grid"><ChevronRight size={22} /></button>
    </>}
  </section>;
}

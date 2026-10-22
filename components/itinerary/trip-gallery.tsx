"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { TripPhoto } from "@/lib/trip-photos";

type Words = { galleryLabel: string; galleryButton: string; photoOf: string; prevPhoto: string; nextPhoto: string; closeLabel: string };
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const SLIDE_MS = 5000;

/**
 * The trip's photos at the top of the page, like a story: each one slowly zooms in, then the next fades in, with one
 * loading bar per photo filling at the bottom. Swipe or the arrows change photo; "Gallery" opens them full screen. With
 * reduced motion the photos neither zoom nor change by themselves.
 */
export function TripGallery({ photos, words }: { photos: TripPhoto[]; words: Words }) {
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  const [viewing, setViewing] = useState(false);
  const touch = useRef<number | null>(null);
  const count = photos.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);
  useEffect(() => { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (still || viewing || count < 2) return; // paused while the full-screen gallery is open
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, still, viewing, count]);
  if (!count) return null;
  return <section aria-roledescription="carousel" aria-label={words.galleryLabel} className="relative aspect-[4/3] overflow-hidden bg-slate-900 sm:aspect-[2/1]"
    onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
    onTouchEnd={(e) => { const start = touch.current; touch.current = null; if (start == null) return; const dx = e.changedTouches[0].clientX - start; if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1)); }}>
    {photos.map((p, i) => <figure key={p.src} aria-roledescription="slide" aria-label={fill(words.photoOf, { n: i + 1, total: count })} aria-hidden={i !== index}
      className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}>
      <img src={p.src} alt={p.stop} loading={i === 0 ? "eager" : "lazy"}
        className={`h-full w-full object-cover ${i === index && !still && count > 1 ? "animate-[trip-photo-zoom_5s_linear_forwards]" : ""}`} key={i === index ? `${p.src}-${index}` : p.src} />
    </figure>)}
    <button type="button" onClick={() => setViewing(true)} className="absolute bottom-14 right-3 inline-flex min-h-tap items-center gap-2 rounded-xl bg-black/60 px-4 text-[16px] font-semibold text-white backdrop-blur-sm"><Images size={19} aria-hidden />{words.galleryButton}</button>
    <PhotoViewer photos={photos} start={index} open={viewing} onOpenChange={setViewing} words={words} />
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

/** "Gallery": every photo whole, full screen on black, swiped left and right (arrows and arrow keys on a computer). */
function PhotoViewer({ photos, start, open, onOpenChange, words }: { photos: TripPhoto[]; start: number; open: boolean; onOpenChange: (open: boolean) => void; words: Words }) {
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const show = (i: number, smooth = true) => { const el = strip.current; if (el) el.scrollTo({ left: Math.max(0, Math.min(photos.length - 1, i)) * el.clientWidth, behavior: smooth ? "smooth" : "instant" }); };
  const onScroll = () => { const el = strip.current; if (el && el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth)); };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[60] flex flex-col bg-black text-white outline-none"
        onOpenAutoFocus={() => { setAt(start); requestAnimationFrame(() => show(start, false)); }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") show(at + 1); if (e.key === "ArrowLeft") show(at - 1); }}>
        <Dialog.Title className="sr-only">{words.galleryLabel}</Dialog.Title>
        <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p aria-live="polite" className="text-[15px] font-semibold tabular-nums text-white/85">{at + 1} / {photos.length}</p>
          <Dialog.Close aria-label={words.closeLabel} className="grid size-tap place-items-center rounded-full text-white hover:bg-white/10"><X size={26} /></Dialog.Close>
        </div>
        <div ref={strip} onScroll={onScroll} className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((p, i) => <figure key={p.src} aria-roledescription="slide" aria-label={fill(words.photoOf, { n: i + 1, total: photos.length })} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            <img src={p.src} alt={p.stop} loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"} className="max-h-full max-w-full object-contain" />
          </figure>)}
        </div>
        {photos.length > 1 && <>
          <button type="button" onClick={() => show(at - 1)} disabled={at === 0} aria-label={words.prevPhoto} className="absolute left-3 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-0 sm:grid"><ChevronLeft size={26} /></button>
          <button type="button" onClick={() => show(at + 1)} disabled={at === photos.length - 1} aria-label={words.nextPhoto} className="absolute right-3 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-0 sm:grid"><ChevronRight size={26} /></button>
        </>}
        <div className="h-[max(1rem,env(safe-area-inset-bottom))]" />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

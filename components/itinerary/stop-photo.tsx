"use client";

import { useState } from "react";
import { PhotoViewer, type GalleryWords } from "@/components/itinerary/trip-gallery";

/** A place's photo in the timeline: tapping it opens only this place's own photos full screen, from the first. */
export function StopPhoto({ photos, name, words, className }: { photos: string[]; name: string; words: GalleryWords; className: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="relative block w-full cursor-zoom-in overflow-hidden text-left">
      <img src={photos[0]} alt={name} className={className} loading="lazy" />
      {photos.length > 1 && <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/65 px-2 py-0.5 text-[14px] font-bold text-white">+{photos.length - 1}</span>}
    </button>
    <PhotoViewer photos={photos.map((src) => ({ src, stop: name }))} start={0} open={open} onOpenChange={setOpen} words={words} title={name} />
  </>;
}

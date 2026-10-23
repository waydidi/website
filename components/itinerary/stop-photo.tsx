"use client";

import { OPEN_TRIP_PHOTO } from "@/components/itinerary/trip-gallery";

/** A place's photo on the page: tapping it opens the full-screen gallery at this place's first photo. */
export function StopPhoto({ src, alt, more = 0, className }: { src: string; alt: string; more?: number; className: string }) {
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TRIP_PHOTO, { detail: src }))} className="relative block w-full cursor-zoom-in overflow-hidden text-left">
    <img src={src} alt={alt} className={className} loading="lazy" />
    {more > 0 && <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/65 px-2 py-0.5 text-[14px] font-bold text-white">+{more}</span>}
  </button>;
}

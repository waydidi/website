"use client";

import { Map as MapIcon, X } from "lucide-react";
import type { MapPoint } from "@/components/trip-planner/route-map";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** "View maps": the trip's route map (one per day) in a sheet from the bottom of the screen. Hidden without map points. */
export function MapsSheet({ days, words }: { days: { id: string; label: string; points: MapPoint[] }[]; words: { viewMaps: string; mapsTitle: string; closeLabel: string } }) {
  const withPoints = days.filter((d) => d.points.length);
  if (!withPoints.length) return null;
  return <Sheet>
    <SheetTrigger className="mt-5 flex min-h-tap w-full items-center justify-center gap-2 rounded-xl border border-slate-500 bg-white px-4 py-3 text-[17px] font-bold text-plum hover:bg-canvas">
      <MapIcon size={20} aria-hidden />{words.viewMaps}
    </SheetTrigger>
    <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="mx-auto max-h-[90dvh] max-w-[880px] gap-0 rounded-t-[22px] p-0">
      <span aria-hidden className="mx-auto mt-3 block h-1.5 w-12 rounded-full bg-slate-200" />
      <div className="relative px-14 pb-2 pt-3 text-center">
        <SheetTitle className="text-[19px] font-bold text-plum">{words.mapsTitle}</SheetTitle>
        <SheetClose aria-label={words.closeLabel} className="absolute right-3 top-1 grid size-tap place-items-center rounded-full text-plum hover:bg-canvas"><X size={22} /></SheetClose>
      </div>
      <div className="grid gap-5 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-7">
        {withPoints.map((d) => <div key={d.id}>
          {d.label && <p className="mb-2 text-[16px] font-bold text-plum">{d.label}</p>}
          <div className="overflow-hidden rounded-2xl border border-slate-200"><ItineraryMap points={d.points} /></div>
        </div>)}
      </div>
    </SheetContent>
  </Sheet>;
}

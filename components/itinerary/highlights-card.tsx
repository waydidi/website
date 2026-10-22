"use client";

import { ChevronRight, ThumbsUp, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * The trip's highlights as a short card (the first one, fading out) with "See more", which opens every highlight in a
 * sheet from the bottom of the screen. Nothing shows when the trip's places have no highlights.
 */
export function HighlightsCard({ items, words }: { items: string[]; words: { highlights: string; seeMore: string; closeLabel: string } }) {
  if (!items.length) return null;
  return <Sheet>
    <div className="relative overflow-hidden rounded-card bg-[#f9f4ef] px-5 pb-4 pt-5 sm:px-6">
      <ul className="relative max-h-[92px] overflow-hidden pr-16 text-[17px] leading-7 text-plum [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
        {items.slice(0, 2).map((x) => <li key={x} className="flex gap-3"><span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-plum" />{x}</li>)}
      </ul>
      <SheetTrigger className="mt-2 inline-flex min-h-tap items-center gap-1 text-[17px] font-bold text-plum underline underline-offset-4">{words.seeMore}<ChevronRight size={20} aria-hidden /></SheetTrigger>
      <span aria-hidden className="absolute bottom-4 right-5 grid size-14 place-items-center rounded-full bg-brand-wash text-brand-deep"><ThumbsUp size={28} /></span>
    </div>
    <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="mx-auto max-h-[85dvh] max-w-[880px] gap-0 rounded-t-[22px] p-0">
      <span aria-hidden className="mx-auto mt-3 block h-1.5 w-12 rounded-full bg-slate-200" />
      <div className="relative px-14 pb-2 pt-3 text-center">
        <SheetTitle className="text-[19px] font-bold text-plum">{words.highlights}</SheetTitle>
        <SheetClose aria-label={words.closeLabel} className="absolute right-3 top-1 grid size-tap place-items-center rounded-full text-plum hover:bg-canvas"><X size={22} /></SheetClose>
      </div>
      <ul className="grid gap-4 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-[17px] leading-7 text-plum sm:px-7">
        {items.map((x) => <li key={x} className="flex gap-3"><span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-plum" />{x}</li>)}
      </ul>
    </SheetContent>
  </Sheet>;
}

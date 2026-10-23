"use client";

import { ChevronRight, Sparkle, Sparkles, ThumbsUp, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** A thumbs-up with sparkles, the card's corner picture (like Trip.com's). */
function Cheer({ className }: { className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute text-[#f2c14e] ${className}`}>
    <Sparkles size={22} className="absolute -left-5 -top-1" />
    <ThumbsUp size={44} fill="currentColor" strokeWidth={1.2} className="text-[#f6c95c]" />
  </span>;
}

const Item = ({ text }: { text: string }) => <li className="flex gap-2.5"><Sparkle size={13} aria-hidden fill="currentColor" className="mt-[7px] shrink-0 text-plum" />{text}</li>;

/**
 * The trip's highlights in a cream card under the day at a glance: the first two, fading out, and "See more", which
 * opens every highlight in a sheet from the bottom of the screen.
 */
export function HighlightsCard({ items, words }: { items: string[]; words: { highlights: string; seeMore: string; closeLabel: string } }) {
  if (!items.length) return null;
  return <Sheet>
    <div className="relative overflow-hidden rounded-card bg-[#fffaee] px-5 pb-4 pt-5 sm:px-6">
      <Cheer className="right-6 top-4" />
      <h2 className="pr-20 text-[20px] font-bold text-plum">{words.highlights}</h2>
      <ul className="mt-3 grid max-h-[104px] gap-2.5 overflow-hidden pr-2 text-[16px] leading-6 text-plum [mask-image:linear-gradient(to_bottom,#000_50%,transparent)]">
        {items.slice(0, 2).map((x) => <Item key={x} text={x} />)}
      </ul>
      <div className="flex justify-end">
        <SheetTrigger className="inline-flex min-h-tap items-center gap-0.5 text-[16px] font-bold text-plum">{words.seeMore}<ChevronRight size={18} aria-hidden /></SheetTrigger>
      </div>
    </div>
    <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="mx-auto max-h-[85dvh] max-w-[880px] gap-0 overflow-hidden rounded-t-[22px] border-0 bg-[#fffaee] p-0">
      <div className="relative px-14 pb-4 pt-5 text-center">
        <SheetClose aria-label={words.closeLabel} className="absolute left-3 top-3 grid size-tap place-items-center rounded-full text-plum hover:bg-white/70"><X size={24} /></SheetClose>
        <SheetTitle className="text-[20px] font-bold text-plum">{words.highlights}</SheetTitle>
        <Cheer className="right-7 top-4" />
      </div>
      <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <ul className="grid gap-4 rounded-2xl border border-[#f3dfa8] bg-white px-5 py-5 text-[16px] leading-7 text-plum">
          {items.map((x) => <Item key={x} text={x} />)}
        </ul>
      </div>
    </SheetContent>
  </Sheet>;
}

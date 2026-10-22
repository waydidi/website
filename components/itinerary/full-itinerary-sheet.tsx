"use client";

import type { ReactNode } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** "View full itinerary": the day plan (map and Time / Attractions table) in a sheet that slides up over the page. */
export function FullItinerarySheet({ label, title, close, children }: { label: string; title: string; close: string; children: ReactNode }) {
  return <Sheet>
    <SheetTrigger className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-plum/70 px-5 text-[17px] font-bold text-plum hover:bg-canvas">
      <MapIcon size={20} aria-hidden />{label}
    </SheetTrigger>
    <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="mx-auto h-[92dvh] max-w-[880px] gap-0 rounded-t-card bg-canvas p-0">
      <div className="flex items-center justify-between gap-3 rounded-t-card border-b border-slate-200 bg-white px-5 py-3">
        <SheetTitle className="text-[19px] font-bold text-plum">{title}</SheetTitle>
        <SheetClose aria-label={close} className="grid size-tap place-items-center rounded-full text-plum hover:bg-canvas"><X size={22} /></SheetClose>
      </div>
      <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </SheetContent>
  </Sheet>;
}

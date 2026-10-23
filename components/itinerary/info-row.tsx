"use client";

import type { ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** One row under What's included: tapping it opens its details in a sheet from the bottom of the screen. */
export function InfoRow({ title, closeLabel, children }: { title: string; closeLabel: string; children: ReactNode }) {
  return <Sheet>
    <SheetTrigger className="flex min-h-[60px] w-full items-center justify-between gap-3 text-left text-[18px] font-bold">
      {title}<ChevronRight aria-hidden size={22} className="shrink-0" />
    </SheetTrigger>
    <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="mx-auto max-h-[85dvh] max-w-[880px] gap-0 rounded-t-[22px] p-0">
      <span aria-hidden className="mx-auto mt-3 block h-1.5 w-12 rounded-full bg-slate-200" />
      <div className="relative px-14 pb-2 pt-3 text-center">
        <SheetTitle className="text-[19px] font-bold text-plum">{title}</SheetTitle>
        <SheetClose aria-label={closeLabel} className="absolute right-3 top-1 grid size-tap place-items-center rounded-full text-plum hover:bg-canvas"><X size={22} /></SheetClose>
      </div>
      <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-[16px] leading-7 text-slate-700 sm:px-7">{children}</div>
    </SheetContent>
  </Sheet>;
}

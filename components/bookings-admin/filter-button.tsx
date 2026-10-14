"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { FILTER_OPTIONS, NO_FILTER, activeFilters } from "@/lib/booking-filter";
import { setBookingFilter, useBookingFilter } from "@/lib/booking-filter-store";

// Phone: a pill like the View picker, in the same row. Tapping it opens the filters (date, driver, payment, status).
export function BookingFilterButton() {
  const [open, setOpen] = useState(false);
  const filter = useBookingFilter();
  const count = activeFilters(filter);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={count ? `Filter, ${count} active` : "Filter"} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[15px] font-medium text-night shadow-sm ring-1 ring-slate-200">
      <SlidersHorizontal size={16} />Filter{count > 0 && <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{count}</span>}
    </button>
    {open && <Modal open onClose={() => setOpen(false)} sheet className="max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-5 text-night sm:max-w-md sm:rounded-3xl">
      <div className="flex items-center justify-between">
        <ModalTitle className="text-[19px] font-black">Filter bookings</ModalTitle>
        <button type="button" onClick={() => setBookingFilter(NO_FILTER)} disabled={!count} className="text-[14px] font-semibold text-brand-darker underline underline-offset-4 disabled:opacity-40">Clear all</button>
      </div>
      <div className="mt-4 grid gap-5">
        {FILTER_OPTIONS.map((group) => <fieldset key={group.key}>
          <legend className="text-[13px] font-semibold text-slate-500">{group.label}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.options.map(([value, label]) => <button key={value} type="button" aria-pressed={filter[group.key] === value} onClick={() => setBookingFilter({ ...filter, [group.key]: value })}
              className={`h-10 rounded-full px-4 text-[14px] font-semibold ring-1 ${filter[group.key] === value ? "bg-night text-white ring-night" : "bg-white text-slate-700 ring-slate-200"}`}>{label}</button>)}
          </div>
        </fieldset>)}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-6 h-12 w-full rounded-full bg-brand font-black text-white">Done</button>
    </Modal>}
  </>;
}

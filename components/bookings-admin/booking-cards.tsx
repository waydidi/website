"use client";

import { useEffect, useState } from "react";
import { AddDriverDialog, RideCard, type UpcomingRide } from "@/components/admin-overview/upcoming-rides";
import type { PickerDriver } from "@/components/bookings-admin/driver-picker";
import { BookingDeleteButton } from "@/components/booking-delete-button";
import { BookingEditButton } from "@/components/bookings-admin/booking-edit";
import { applyFilter, bangkokToday } from "@/lib/booking-filter";
import { setBookingFilter, useBookingFilter } from "@/lib/booking-filter-store";
import { NO_FILTER, activeFilters } from "@/lib/booking-filter";

// Bookings on phones: one card per booking (as in Upcoming rides), side by side and swiped
// horizontally. Cards start with their details hidden; "See details" opens them.
export function BookingCards({ rides, drivers, label = "Bookings", openRef }: { rides: UpcomingRide[]; drivers: PickerDriver[]; label?: string; /** A booking to show opened and in view (links to a booking land here). */ openRef?: string }) {
  const key = (r: UpcomingRide) => `${r.reference}:${r.leg ?? "outbound"}`;
  const [opened, setOpened] = useState<Set<string>>(() => new Set(openRef ? rides.filter((r) => r.reference === openRef && r.primary !== false).map(key) : []));
  useEffect(() => {
    if (openRef) document.getElementById(`booking-card-${openRef}`)?.scrollIntoView({ block: "center", inline: "center" });
  }, [openRef]);
  const [adding, setAdding] = useState<UpcomingRide | null>(null);
  // The Filter button next to the View picker narrows the cards (nothing is changed on the server).
  const filter = useBookingFilter();
  const shown = applyFilter(rides, filter, bangkokToday());
  const toggle = (id: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <>
    <ul aria-label={label} className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {shown.map((r) => <li key={key(r)} id={r.primary === false ? `booking-card-${r.reference}-${r.leg}` : `booking-card-${r.reference}`} className="w-[86vw] max-w-[380px] shrink-0 snap-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <RideCard r={r} drivers={drivers} open={opened.has(key(r))} onToggle={() => toggle(key(r))} onAddDriver={() => setAdding(r)} actions={r.edit ? <BookingEditButton booking={r.edit} /> : <BookingDeleteButton reference={r.reference} />} />
      </li>)}
    </ul>
    {!shown.length && activeFilters(filter) > 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-[14px] text-slate-500">No bookings match this filter. <button type="button" onClick={() => setBookingFilter(NO_FILTER)} className="font-semibold text-brand-darker underline underline-offset-4">Clear filter</button></p>}
    {adding && <AddDriverDialog reference={adding.reference} leg={adding.leg} onClose={() => setAdding(null)} />}
  </>;
}

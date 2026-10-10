"use client";

import { useState } from "react";
import { AddDriverDialog, RideCard, type UpcomingRide } from "@/components/admin-overview/upcoming-rides";
import type { PickerDriver } from "@/components/bookings-admin/driver-picker";
import { BookingDeleteButton } from "@/components/booking-delete-button";

// Bookings on phones: one card per booking (as in Upcoming rides), side by side and swiped
// horizontally. Cards start with their details hidden; "See details" opens them.
export function BookingCards({ rides, drivers, label = "Bookings" }: { rides: UpcomingRide[]; drivers: PickerDriver[]; label?: string }) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<UpcomingRide | null>(null);
  const toggle = (reference: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(reference)) next.delete(reference); else next.add(reference);
    return next;
  });
  return <>
    <ul aria-label={label} className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {rides.map((r) => <li key={r.reference} className="w-[86vw] max-w-[380px] shrink-0 snap-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <RideCard r={r} drivers={drivers} open={opened.has(r.reference)} onToggle={() => toggle(r.reference)} onAddDriver={() => setAdding(r)} actions={<BookingDeleteButton reference={r.reference} />} />
      </li>)}
    </ul>
    {adding && <AddDriverDialog reference={adding.reference} leg={adding.leg} onClose={() => setAdding(null)} />}
  </>;
}

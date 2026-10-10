"use client";

import { useState } from "react";
import { AddDriverDialog, RideCard, type UpcomingRide } from "@/components/admin-overview/upcoming-rides";
import type { PickerDriver } from "@/components/bookings-admin/driver-picker";

// Bookings on phones: one card per booking (as in Upcoming rides), side by side and swiped
// horizontally. Each card opens with its details showing.
export function BookingCards({ rides, drivers }: { rides: UpcomingRide[]; drivers: PickerDriver[] }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const toggle = (reference: string) => setClosed((current) => {
    const next = new Set(current);
    if (next.has(reference)) next.delete(reference); else next.add(reference);
    return next;
  });
  return <>
    <ul aria-label="Bookings" className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {rides.map((r) => <li key={r.reference} className="w-[86vw] max-w-[380px] shrink-0 snap-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <RideCard r={r} drivers={drivers} open={!closed.has(r.reference)} onToggle={() => toggle(r.reference)} onAddDriver={() => setAdding(r.reference)} />
      </li>)}
    </ul>
    {adding && <AddDriverDialog reference={adding} onClose={() => setAdding(null)} />}
  </>;
}

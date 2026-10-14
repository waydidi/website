"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AddDriverDialog, RideCard, type UpcomingRide } from "@/components/admin-overview/upcoming-rides";
import type { PickerDriver } from "@/components/bookings-admin/driver-picker";
import { BookingDeleteButton } from "@/components/booking-delete-button";
import { BookingEditButton } from "@/components/bookings-admin/booking-edit";
import { applyFilter, bangkokToday } from "@/lib/booking-filter";
import { setBookingFilter, useBookingFilter } from "@/lib/booking-filter-store";
import { NO_FILTER, activeFilters } from "@/lib/booking-filter";

// Bookings on phones: one card per booking (as in Upcoming rides), side by side and swiped
// horizontally. Cards start with their details hidden; "See details" opens them. With a mouse (desktop and
// tablet-sized windows, where there is no swiping) the row has Previous / Next buttons, a thin scrollbar and
// can be dragged.
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
  // Scrolling the row without a touch screen: the Previous / Next buttons and dragging with the mouse.
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure, shown.length]);
  const step = (direction: 1 | -1) => { const el = row.current; if (el) el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" }); };
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const toggle = (id: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <>
    <div className="relative">
    {shown.length > 1 && <>
      <button type="button" onClick={() => step(-1)} disabled={edge.start} aria-label="Previous bookings" className="absolute left-1 top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white shadow-md ring-1 ring-slate-200 disabled:pointer-events-none disabled:opacity-0 [@media(hover:hover)]:grid"><ChevronLeft size={20} /></button>
      <button type="button" onClick={() => step(1)} disabled={edge.end} aria-label="Next bookings" className="absolute right-1 top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white shadow-md ring-1 ring-slate-200 disabled:pointer-events-none disabled:opacity-0 [@media(hover:hover)]:grid"><ChevronRight size={20} /></button>
    </>}
    <ul ref={row} aria-label={label} onScroll={measure}
      onPointerDown={(e) => { if (e.pointerType === "mouse" && e.button === 0 && !(e.target as HTMLElement).closest("button,a,input,select,textarea,[role=combobox]") && row.current) drag.current = { x: e.clientX, left: row.current.scrollLeft, moved: false }; }}
      onPointerMove={(e) => { const d = drag.current, el = row.current; if (!d || !el) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 4) d.moved = true; if (d.moved) { el.style.scrollSnapType = "none"; el.scrollLeft = d.left - dx; } }}
      onPointerUp={() => { const el = row.current; drag.current = null; if (el) el.style.scrollSnapType = ""; }}
      onPointerLeave={() => { const el = row.current; drag.current = null; if (el) el.style.scrollSnapType = ""; }}
      className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [@media(hover:hover)]:cursor-grab [@media(hover:hover)]:[scrollbar-width:thin]">
      {shown.map((r) => <li key={key(r)} id={r.primary === false ? `booking-card-${r.reference}-${r.leg}` : `booking-card-${r.reference}`} className="w-[86vw] max-w-[380px] shrink-0 snap-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <RideCard r={r} drivers={drivers} open={opened.has(key(r))} onToggle={() => toggle(key(r))} onAddDriver={() => setAdding(r)} actions={r.edit ? <BookingEditButton booking={r.edit} /> : <BookingDeleteButton reference={r.reference} />} />
      </li>)}
    </ul>
    </div>
    {!shown.length && activeFilters(filter) > 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-[14px] text-slate-500">No bookings match this filter. <button type="button" onClick={() => setBookingFilter(NO_FILTER)} className="font-semibold text-brand-darker underline underline-offset-4">Clear filter</button></p>}
    {adding && <AddDriverDialog reference={adding.reference} leg={adding.leg} onClose={() => setAdding(null)} />}
  </>;
}

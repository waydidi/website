"use client";

import { MapPin, Phone, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import type { DriverDay } from "@/lib/trip-driver";

/** Day-trip plan for the driver: shown only when the booking came from the trip planner. */
export function DriverDayPlan({ token }: { token: string }) {
  const [days, setDays] = useState<DriverDay[]>([]);
  useEffect(() => {
    let active = true;
    fetch(`/api/driver/trips/${token}/plan`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { days: [] })).then((d: { days: DriverDay[] }) => { if (active) setDays(d.days ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, [token]);
  if (!days.length) return null;
  return <section className="mx-auto max-w-[680px] px-4 pb-10">
    {days.map((d) => <div key={d.ref} className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
      <p className="text-[12px] font-bold uppercase tracking-[.14em] text-[#D96F00]">Day plan{days.length > 1 ? ` · Day ${d.dayNumber}` : ""} · {d.date}</p>
      <h2 className="mt-1 text-[20px] font-bold">{d.title}</h2>
      <p className="mt-1 text-[14px] text-slate-600">{d.guests}</p>
      {d.notes && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-[14px]">{d.notes}</p>}
      <ol className="mt-4 grid gap-3 text-[15px]">
        <li><b className="tabular-nums">{d.pickupTime}</b> Pickup · {d.pickup}</li>
        {d.stops.map((s, i) => <li key={i} className="rounded-2xl border border-slate-100 p-3">
          <p><b className="tabular-nums">{s.start}–{s.end}</b> {s.name}{s.program ? ` · ${s.program}` : ""}</p>
          {s.checkIn && <p className="mt-1 text-[14px] font-semibold text-[#9A4D00]">Check in by {s.checkIn} (arrive {s.arrive})</p>}
          {s.tickets && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-600"><Ticket size={14} />{s.tickets}</p>}
          {s.contact && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-600"><Phone size={14} />{s.contact}</p>}
          {s.note && <p className="mt-1 text-[13px] text-slate-600">{s.note}</p>}
          {s.lat != null && s.lng != null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#C96100]"><MapPin size={14} />Navigate</a>}
        </li>)}
        <li><b className="tabular-nums">{d.returnAt}</b> Drop-off · {d.end}</li>
      </ol>
      {d.skipped.length > 0 && <p className="mt-3 text-[13px] text-slate-500">Skipped today: {d.skipped.join(", ")}</p>}
    </div>)}
  </section>;
}

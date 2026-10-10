"use client";

import { Luggage, Users, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";

type ReturnLeg = { reference: string; date: string; time: string; from: string; to: string; passengers: number; luggage: number; vehicle: string };

// "18/10/2026 — 09:00 am", same as the Upcoming rides details.
const dateTime = (date: string, time: string) => { const [y, m, d] = date.split("-"); const [h = 0, min = 0] = time.split(":").map(Number); return `${d}/${m}/${y} — ${String(h % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const vehicleName = (v: string) => { const t = v.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

/** A "Return" pill in the bookings list; opens the return journey's details. */
export function ReturnPill({ leg }: { leg: ReturnLeg }) {
  const [open, setOpen] = useState(false);
  const rows: [string, React.ReactNode][] = [
    ["Passengers & luggage", <span key="pl" className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><Users size={15} aria-hidden="true" />{leg.passengers}</span><span className="inline-flex items-center gap-1"><Luggage size={15} aria-hidden="true" />{leg.luggage}</span></span>],
    ["Vehicle", vehicleName(leg.vehicle)],
    ["Date & time", dateTime(leg.date, leg.time)],
    ["From", leg.from],
    ["To", leg.to],
  ];
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Return journey for ${leg.reference}`} className="mt-1 inline-flex rounded-full bg-sky-50 px-2.5 py-0.5 text-[12px] font-bold text-sky-700 hover:bg-sky-100">Return</button>
    {open && <Modal open onClose={() => setOpen(false)} sheet overlayClassName="bg-black/40" className="max-w-md rounded-t-3xl p-5 sm:rounded-3xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><ModalTitle className="text-[18px] font-black">Return journey</ModalTitle><p className="font-mono text-[12.5px] text-slate-500">{leg.reference}</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <dl className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-[13.5px]">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
        <Link href={`/admin/journeys/${encodeURIComponent(leg.reference)}`} className="mt-1 justify-self-end text-[13px] font-semibold text-brand-darker hover:underline">Open booking →</Link>
      </dl>
    </Modal>}
  </>;
}

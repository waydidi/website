"use client";

import { useState } from "react";
import { ChevronDown, Siren } from "lucide-react";

// Thailand's official emergency numbers (free from any phone).
const NUMBERS = [
  { label: "Tourist Police (English-speaking)", number: "1155" },
  { label: "Police", number: "191" },
  { label: "Ambulance & medical emergency", number: "1669" },
];

export function EmergencyCard() {
  const [open, setOpen] = useState(false);
  return <div className="rounded-xl bg-white shadow-[0_2px_12px_rgb(15_23_42/0.06)]">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-5 text-left text-xl font-medium text-[#211726]">
      <Siren size={24} className="text-red-600" aria-hidden="true" />Emergency assistance
      <ChevronDown size={20} className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div className="border-t border-slate-100 px-5 pb-5 pt-3">
      <p className="text-[15px] leading-6 text-slate-600">If anyone is in danger, call Thailand&apos;s emergency services first, then tell Waydidi your booking reference.</p>
      <ul className="mt-3 grid gap-2">{NUMBERS.map((n) => <li key={n.number}><a href={`tel:${n.number}`} className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-[15px] text-red-900"><span>{n.label}</span><strong className="text-lg">{n.number}</strong></a></li>)}</ul>
    </div>}
  </div>;
}

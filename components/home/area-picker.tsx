"use client";

import { Check, MapPinned, Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import type { HourlyArea } from "@/lib/hourly-areas-data";

// Hourly service area: a field that opens a centred list of Waydidi cities.
export function AreaPicker({ areas, value, onChange, className, label = "Area" }: { areas: HourlyArea[]; value: string; onChange: (slug: string) => void; className: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = areas.find((a) => a.slug === value);
  const q = query.trim().toLowerCase();
  const list = q ? areas.filter((a) => `${a.name} ${a.coverage}`.toLowerCase().includes(q)) : areas;
  return <DialogPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
    <DialogPrimitive.Trigger asChild>
      <button type="button" className={className} aria-label={chosen ? `${label}: ${chosen.name}` : `Choose ${label.toLowerCase()}`}>
        <MapPinned size={19} className="shrink-0 text-slate-950" aria-hidden="true" />
        <span className="min-w-0 text-left">
          <span className="block text-[13px]/[18px] font-normal text-slate-500">{label}</span>
          <span className={`block truncate text-[15px]/[22px] ${chosen ? "text-slate-950" : "text-slate-400"}`}>{chosen?.name ?? "Choose city"}</span>
        </span>
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content aria-describedby={undefined} className="font-home fixed left-1/2 top-1/2 z-[81] flex max-h-[80dvh] w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] bg-white p-5 text-ink shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
        <DialogPrimitive.Title className="text-center text-[17px] font-bold">Where will your driver be?</DialogPrimitive.Title>
        <label className="mt-3 flex items-center gap-2 rounded-2xl bg-[#F4F4F2] px-3.5">
          <Search size={17} className="shrink-0 text-slate-500" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search city" aria-label="Search city" className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>
        <ul className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <li className="px-3 py-6 text-center text-slate-500">No city matches.</li>}
          {list.map((a) => <li key={a.slug}>
            <button type="button" onClick={() => { onChange(a.slug); setOpen(false); setQuery(""); }} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${a.slug === value ? "bg-brand-tint" : "hover:bg-slate-50"}`}>
              <span className="size-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className={`block text-[16px] ${a.slug === value ? "font-bold text-brand-text" : "font-semibold"}`}>{a.name}</span><span className="block truncate text-[12.5px] text-slate-500">{a.coverage}</span></span>
              {a.slug === value && <Check size={18} className="shrink-0 text-brand-text" />}
            </button>
          </li>)}
        </ul>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

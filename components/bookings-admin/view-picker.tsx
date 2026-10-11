"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Check, ChevronDown, Columns3, List } from "lucide-react";
import { useCloseOutside } from "@/lib/use-close-outside";

const VIEWS = [["list", "List", List], ["calendar", "Calendar", CalendarDays], ["board", "Board", Columns3]] as const;
export type BookingsView = (typeof VIEWS)[number][0];

// Phone: one pill showing the chosen view; tapping it lists List / Calendar / Board.
export function ViewPicker({ mode, type }: { mode: BookingsView; type: string }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOutside<HTMLDivElement>(open, () => setOpen(false));
  const [, label, Icon] = VIEWS.find(([id]) => id === mode) ?? VIEWS[0];
  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`View: ${label}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[15px] font-medium text-night shadow-sm ring-1 ring-slate-200">
      <Icon size={16} />{label}<ChevronDown size={16} className={`text-slate-500 transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div role="menu" className="absolute right-0 top-12 z-30 grid w-44 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-slate-200 animate-in fade-in slide-in-from-top-1">
      {VIEWS.map(([id, text, ItemIcon]) => <Link key={id} role="menuitem" href={`/admin/bookings?type=${type}&mode=${id}`} onClick={() => setOpen(false)} className={`flex items-center gap-2 px-4 py-3 text-[15px] ${id === mode ? "font-semibold text-night" : "text-slate-600"} hover:bg-slate-50`}>
        <ItemIcon size={16} />{text}{id === mode && <Check size={16} className="ml-auto text-brand" />}
      </Link>)}
    </div>}
  </div>;
}

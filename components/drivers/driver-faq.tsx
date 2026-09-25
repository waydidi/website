"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Daytrip-style FAQ: white rounded cards with a chevron.
export function DriverFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return <ul className="mt-6 grid gap-3">
    {items.map((item, i) => {
      const expanded = open === i;
      return <li key={item.q} className="rounded-[20px] bg-white">
        <button type="button" aria-expanded={expanded} aria-controls={`dfaq-${i}`} onClick={() => setOpen(expanded ? null : i)} className="flex w-full items-center gap-4 px-6 py-5 text-left">
          <span className="flex-1 text-[15px] leading-6 text-[#111] sm:text-[17px]">{item.q}</span>
          <ChevronDown size={22} className={`shrink-0 text-[#C96100] transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {expanded && <p id={`dfaq-${i}`} className="-mt-1 px-6 pb-5 text-[14px] leading-6 text-[#4A4A4A]">{item.a}</p>}
      </li>;
    })}
  </ul>;
}

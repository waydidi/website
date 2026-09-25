"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

// Same look as the homepage FAQ, with driver questions.
export function DriverFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return <ul className="mt-6">
    {items.map((item, i) => {
      const expanded = open === i;
      return <li key={item.q} className="border-b border-[#E3E5EA] last:border-b-0">
        <button type="button" aria-expanded={expanded} aria-controls={`dfaq-${i}`} onClick={() => setOpen(expanded ? null : i)} className="flex w-full items-center gap-4 py-5 text-left">
          <span className="flex-1 text-[15px] font-semibold leading-6 text-[#111]">{item.q}</span>
          <span className={`grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-[#BDBDBD] text-[#9A9A9A] transition ${expanded ? "rotate-45" : ""}`}><Plus size={14} strokeWidth={2.2} aria-hidden="true" /></span>
        </button>
        {expanded && <p id={`dfaq-${i}`} className="-mt-2 pb-5 pr-10 text-[14px] leading-6 text-[#4A4A4A]">{item.a}</p>}
      </li>;
    })}
  </ul>;
}

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n";


// Question counts per tab; the text lives in messages/*.json (faq.<tab>.<n>.q / .a).
const TABS = [["booking", 5], ["conditions", 3], ["changes", 2], ["payment", 3], ["meeting", 3]] as const;

export function HomeFaq() {
  const { t } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(TABS[0][0]);
  const [open, setOpen] = useState<string | null>(null);
  const count = TABS.find(([id]) => id === tab)![1];
  const items = Array.from({ length: count }, (_, i) => ({ q: t(`faq.${tab}.${i + 1}.q` as MessageKey), a: t(`faq.${tab}.${i + 1}.a` as MessageKey) }));

  return <section aria-labelledby="home-faq-heading" className="font-home bg-white py-10 sm:py-14">
    <h2 id="home-faq-heading" className="mx-auto max-w-[760px] px-5 text-left text-[28px] font-bold leading-[1.1] tracking-[-.03em] text-[#1C1C1C]">{t("faq.title")}</h2>
    <div role="tablist" aria-label="FAQ topics" className="mx-auto mt-6 flex max-w-[760px] gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(([id]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setOpen(null); }}
        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[15px] font-semibold transition ${tab === id ? "bg-brand text-white" : "text-[#8A8A8A] hover:text-[#1C1C1C]"}`}>{t(`faq.tab.${id}` as MessageKey)}</button>)}
    </div>
    <ul role="tabpanel" className="mx-auto mt-4 max-w-[760px] px-5">
      {items.map((item, i) => {
        const id = `${tab}-${i}`;
        const expanded = open === id;
        return <li key={id} className="border-b border-[#E6E6E6] last:border-b-0">
          <button type="button" aria-expanded={expanded} aria-controls={`${id}-a`} onClick={() => setOpen(expanded ? null : id)} className="flex w-full items-center gap-4 py-5 text-left">
            <span className="flex-1 text-[15px] font-semibold leading-6 text-[#1C1C1C]">{item.q}</span>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-[#BDBDBD] text-[#9A9A9A] transition ${expanded ? "rotate-45" : ""}`}><Plus size={14} strokeWidth={2.2} aria-hidden="true" /></span>
          </button>
          {expanded && <p id={`${id}-a`} className="-mt-2 pb-5 pr-10 text-[14px] leading-6 text-[#4A4A4A]">{item.a}</p>}
        </li>;
      })}
    </ul>
  </section>;
}

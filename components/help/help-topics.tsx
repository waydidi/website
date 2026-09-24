"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CircleHelp, CreditCard, Luggage, Plane, RefreshCcw, Route } from "lucide-react";

export type HelpTopic = { id: string; label: string; icon: "route" | "plane" | "refresh" | "card" | "luggage"; questions: { q: string; a: string }[] };
const ICONS = { route: Route, plane: Plane, refresh: RefreshCcw, card: CreditCard, luggage: Luggage };

/** Informative FAQ by topic (Trip.com "Service chat" layout, no live chat). */
export function HelpTopics({ topics, chatHref }: { topics: HelpTopic[]; chatHref: string }) {
  const [active, setActive] = useState(topics[0].id);
  const [open, setOpen] = useState<string | null>(null);
  const topic = topics.find((t) => t.id === active) ?? topics[0];

  return <div>
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none]" role="tablist" aria-label="Help topics">
      {topics.map((t) => {
        const Icon = ICONS[t.icon];
        const selected = t.id === active;
        return <button key={t.id} role="tab" aria-selected={selected} onClick={() => { setActive(t.id); setOpen(null); }}
          className={`relative flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-[15px] transition ${selected ? "border-[#211726] bg-[#211726] text-white" : "border-slate-200 bg-white text-[#211726] hover:border-slate-300"}`}>
          <Icon size={18} aria-hidden="true" />{t.label}
          {selected && <span aria-hidden="true" className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 bg-[#211726]" />}
        </button>;
      })}
    </div>
    <ul className="mt-4 grid gap-3" role="tabpanel" aria-label={topic.label}>
      {topic.questions.map((item) => {
        const key = `${topic.id}:${item.q}`;
        const expanded = open === key;
        return <li key={key} className="rounded-lg bg-[#F5F6F8]">
          <button onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-base text-[#211726]">
            {item.q}
            <ChevronDown size={20} className={`shrink-0 text-[#FF8A05] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {expanded && <p className="px-4 pb-4 text-[15px] leading-6 text-slate-600">{item.a}</p>}
        </li>;
      })}
      <li>
        <a href={chatHref} target={chatHref.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="flex items-center justify-between gap-4 rounded-lg bg-[#F5F6F8] px-4 py-4 text-base text-[#211726] hover:bg-slate-100">
          <span className="flex items-center gap-2"><CircleHelp size={18} className="text-[#FF8A05]" aria-hidden="true" />Have a different question? Chat with us now.</span>
          <ChevronRight size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
        </a>
      </li>
    </ul>
  </div>;
}

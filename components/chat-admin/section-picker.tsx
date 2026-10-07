"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const CHAT_SECTIONS: [string, string][] = [["", "Inbox"], ["cee", "Non knowledge"], ["alerts", "Alerts & limits"], ["reviews", "Support reviews"], ["telegram", "Telegram team"]];

/** One pill next to the "Website chat" title: shows the section you're in, tap to pick another. */
export function ChatSectionPicker() {
  const tab = useSearchParams().get("tab") ?? "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const current = CHAT_SECTIONS.find(([k]) => k === tab) ?? CHAT_SECTIONS[0];
  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={`Chat section: ${current[1]}`}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FFF0DF] px-4 text-[14px] font-semibold text-[#C96100] hover:bg-[#FFE6CC]">
      {current[1]}<ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <nav role="menu" aria-label="Chat sections" className="absolute left-0 top-[calc(100%+6px)] z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg">
      {CHAT_SECTIONS.map(([k, l]) => <Link key={k} role="menuitem" href={k ? `/admin/chat?tab=${k}` : "/admin/chat"} onClick={() => setOpen(false)} aria-current={k === current[0] ? "page" : undefined}
        className={`flex items-center justify-between px-4 py-2.5 text-[14px] ${k === current[0] ? "font-semibold text-[#C96100]" : "text-slate-700 hover:bg-slate-50"}`}>{l}{k === current[0] && <Check size={16} />}</Link>)}
    </nav>}
  </div>;
}

"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

// Share an article to chat apps and social networks, or copy its link.
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const targets = [
    { name: "LINE", href: `https://social-plugins.line.me/lineit/share?url=${u}`, bg: "#06C755", label: "L" },
    { name: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}`, bg: "#25D366", label: "W" },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, bg: "#1877F2", label: "f" },
    { name: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`, bg: "#000000", label: "𝕏" },
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return <div className="flex flex-wrap items-center gap-2.5">
    <span className="mr-1 text-[15px] font-semibold">Share this guide</span>
    {targets.map((s) => <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${s.name}`} title={s.name} className="grid size-10 place-items-center rounded-full text-[17px] font-bold text-white hover:opacity-90" style={{ background: s.bg }}>{s.label}</a>)}
    <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#D6D3CC] px-4 text-[14px] font-semibold hover:bg-slate-50">{copied ? <><Check size={16} className="text-[#0E9F6E]" aria-hidden="true" />Copied</> : <><Link2 size={16} aria-hidden="true" />Copy link</>}</button>
  </div>;
}

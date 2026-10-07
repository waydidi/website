"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyRow({ label, value, shown }: { label: string; value: string; shown?: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#F6B46E] bg-[#FFFAF4] px-3 py-2.5 text-[14px]">
    <span className="min-w-0 flex-1 truncate"><span className="text-slate-500">{label} </span>{shown ?? <b className="text-[#C96100]">{value}</b>}</span>
    <button type="button" onClick={() => void navigator.clipboard.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); })}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF0DF] px-3 py-1 text-[12.5px] font-semibold text-[#C96100]">{done ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button>
  </div>;
}

/** Make a link with the route already filled in, which turns visitors into bookings more often. */
export function LinkBuilder({ slug }: { slug: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = new URLSearchParams({ ref: slug });
  if (from.trim() || to.trim()) { q.set("rebook", "chat"); if (from.trim()) q.set("pickup", from.trim()); if (to.trim()) q.set("dropoff", to.trim()); }
  const link = `https://waydidi.com/?${q}`;
  const field = "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:border-[#FE8B05]";
  return <div className="grid gap-2">
    <div className="grid grid-cols-2 gap-2">
      <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From, e.g. Phuket Airport" aria-label="From" className={field} />
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To, e.g. Patong" aria-label="To" className={field} />
    </div>
    <CopyRow label="" value={link} shown={<span className="break-all font-mono text-[12.5px] text-slate-700">{link}</span>} />
  </div>;
}

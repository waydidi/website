"use client";

import { ArrowUpDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type GiftRow = { id: string; member: string; gift: string; badge: string; issuedAt: string; expiresAt: string; usedRef: string | null; state: "available" | "used" | "expired" };
type Tab = "all" | GiftRow["state"];
const TABS: [Tab, string][] = [["all", "All"], ["available", "Available"], ["used", "Used"], ["expired", "Expired"]];
const PILL: Record<GiftRow["state"], [string, string]> = {
  available: ["Available", "border-orange-300 bg-orange-50 text-orange-600 [--dot:#f97316]"],
  used: ["Used", "border-emerald-300 bg-emerald-50 text-emerald-700 [--dot:#10b981]"],
  expired: ["Expired", "border-slate-300 bg-slate-50 text-slate-600 [--dot:#94a3b8]"],
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const iconBtn = "grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

// Issued tier gifts in the same table style as Driver management.
export function GiftsTable({ rows }: { rows: GiftRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [oldest, setOldest] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => (tab === "all" || r.state === tab) && (!q || [r.member, r.gift, r.badge, r.usedRef ?? ""].some((v) => v.toLowerCase().includes(q))));
    return oldest ? [...list].reverse() : list;
  }, [rows, tab, query, oldest]);
  return <>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Filter" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-9 rounded-lg px-4 text-[15px] ${tab === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}>{label}</button>)}
      </div>
      <div className="flex items-center gap-2">
        {searchOpen && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Member, gift or booking" aria-label="Search gifts" className="h-10 w-56 rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:border-[#FF8A05]" />}
        <button type="button" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }} aria-label={searchOpen ? "Close search" : "Search"} className={iconBtn}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>
        <button type="button" onClick={() => setOldest((v) => !v)} aria-label={oldest ? "Sort: oldest first" : "Sort: newest first"} title={oldest ? "Oldest first" : "Newest first"} className={iconBtn}><ArrowUpDown size={17} /></button>
      </div>
    </div>
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] text-left text-[15px]">
        <thead className="bg-slate-50 text-slate-600"><tr>{["Member", "Gift", "Badge", "Issued", "Expires", "Booking", "Status"].map((h) => <th key={h} className="h-14 px-5 font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-500">{rows.length ? "No gifts match." : "No gifts issued yet."}</td></tr>}
          {shown.map((r) => <tr key={r.id} className="border-t border-slate-100">
            <td className="h-[72px] px-5 font-medium text-[#15161C]">{r.member}</td>
            <td className="px-5">{r.gift}</td>
            <td className="px-5">{r.badge}</td>
            <td className="whitespace-nowrap px-5">{day(r.issuedAt)}</td>
            <td className="whitespace-nowrap px-5">{day(r.expiresAt)}</td>
            <td className="px-5">{r.usedRef ?? "N/A"}</td>
            <td className="px-5"><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13px] font-medium ${PILL[r.state][1]}`}><span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />{PILL[r.state][0]}</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}

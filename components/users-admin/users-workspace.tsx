"use client";

import { ArrowUpDown, Download, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { UserDeleteButton } from "@/components/user-delete-button";
import { AddBookingButton } from "@/components/users-admin/add-booking-button";

// Members (customer accounts), laid out like the Partners → Drivers page.
export type UserRow = { id: string; name: string | null; surname: string | null; email: string; phone: string | null; providers: string | null; trips: number; createdAt: string; lastSeenAt: string | null; marketingOptIn: boolean };

const PROVIDER_LABELS: Record<string, string> = { google: "Google", apple: "Apple", line: "LINE", facebook: "Facebook" };
const TABS = [["all", "All"], ["booked", "With trips"], ["none", "No trips yet"], ["new", "New this month"]] as const;
const SORTS = [["newest", "Newest first"], ["oldest", "Oldest first"], ["name", "Name A–Z"], ["trips", "Most trips"]] as const;
const iconBtn = "grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : "N/A");
const fullName = (u: UserRow) => [u.name, u.surname].filter(Boolean).join(" ") || u.email.split("@")[0];
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <p className="text-[15px] text-slate-700">{label}</p>
    <p className="mt-4 text-[36px] font-semibold leading-none tracking-[-.02em] tabular-nums">{value}</p>
    <p className="mt-4 text-[14px] text-slate-500">{sub}</p>
  </div>;
}

export function UsersWorkspace({ users, monthStart, activeSince }: { users: UserRow[]; monthStart: string; activeSince: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(0);

  const stats = useMemo(() => ({
    total: users.length,
    newThisMonth: users.filter((u) => u.createdAt >= monthStart).length,
    booked: users.filter((u) => u.trips > 0).length,
    active30: users.filter((u) => u.lastSeenAt && u.lastSeenAt >= activeSince).length,
    optIn: users.filter((u) => u.marketingOptIn).length,
  }), [users, monthStart, activeSince]);

  const rows = useMemo(() => {
    const base = tab === "booked" ? users.filter((u) => u.trips > 0) : tab === "none" ? users.filter((u) => u.trips === 0) : tab === "new" ? users.filter((u) => u.createdAt >= monthStart) : users;
    const q = query.trim().toLowerCase();
    const found = q ? base.filter((u) => [fullName(u), u.email, u.phone ?? ""].some((v) => v.toLowerCase().includes(q))) : base;
    const key = SORTS[sort][0];
    return [...found].sort((a, b) => key === "name" ? fullName(a).localeCompare(fullName(b)) : key === "oldest" ? a.createdAt.localeCompare(b.createdAt) : key === "trips" ? b.trips - a.trips : b.createdAt.localeCompare(a.createdAt));
  }, [users, tab, query, sort, monthStart]);

  function exportCsv() {
    const cell = (v: string | number) => { const s = String(v); const safe = /^[=+\-@]/.test(s) && !/^[+\d\s()-]+$/.test(s) ? `'${s}` : s; return `"${safe.replaceAll('"', '""')}"`; };
    const lines = [["Name", "Email", "Phone", "Signs in with", "Trips", "Joined", "Last active", "Offers"], ...rows.map((u) => [fullName(u), u.email, u.phone ?? "", ["Email", ...(u.providers ?? "").split(",").filter(Boolean)].join(" "), u.trips, u.createdAt.slice(0, 10), (u.lastSeenAt ?? "").slice(0, 10), u.marketingOptIn ? "Yes" : "No"])];
    const url = URL.createObjectURL(new Blob([lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `waydidi-members-${tab}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="px-4 pb-10 pt-4 sm:px-8">
    <div className="-mt-[52px] mb-6 flex justify-end gap-2">
      <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 hover:bg-slate-50"><Download size={16} />Export</button>
    </div>

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label="Total members" value={stats.total} sub={`${stats.optIn} accept offers by email`} />
      <StatCard label="New this month" value={stats.newThisMonth} sub="Signed up since the 1st" />
      <StatCard label="Members who booked" value={stats.booked} sub={`${stats.total - stats.booked} have no trips yet`} />
      <StatCard label="Active in the last 30 days" value={stats.active30} sub="Signed in or booked" />
    </div>

    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Filter" className="inline-flex flex-wrap rounded-xl bg-[#E8EAEE] p-1">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-9 rounded-lg px-4 text-[15px] ${tab === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}>{label}</button>)}
      </div>
      <div className="flex items-center gap-2">
        {searchOpen && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or phone" aria-label="Search members" className="h-10 w-56 rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:border-[#FF8A05]" />}
        <button type="button" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }} aria-label={searchOpen ? "Close search" : "Search"} className={iconBtn}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>
        <button type="button" onClick={() => setSort((s) => (s + 1) % SORTS.length)} aria-label={`Sort: ${SORTS[sort][1]}`} title={`Sort: ${SORTS[sort][1]}`} className={iconBtn}><ArrowUpDown size={17} /></button>
      </div>
    </div>

    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[980px] text-left text-[15px]">
        <thead className="bg-slate-50 text-slate-600"><tr>
          {["Member", "Joined", "Phone", "Signs in with", "Trips", "Last active", "Offers", "Action"].map((h) => <th key={h} className="h-14 px-5 font-normal">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-500">{query ? "No members match your search." : users.length ? "No members in this view." : "No one has registered yet."}</td></tr>}
          {rows.map((u) => <tr key={u.id} className="border-t border-slate-100">
            <td className="h-[72px] px-5"><div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[13px] font-bold text-[#C96100]" aria-hidden="true">{initials(fullName(u))}</span>
              <div className="min-w-0"><p className="font-medium text-[#15161C]">{fullName(u)}</p><p className="text-[13px] text-slate-500">{u.email}</p></div></div></td>
            <td className="whitespace-nowrap px-5">{day(u.createdAt)}</td>
            <td className="whitespace-nowrap px-5 tabular-nums">{u.phone || "N/A"}</td>
            <td className="px-5"><div className="flex flex-wrap gap-1">{["Email", ...(u.providers ?? "").split(",").filter(Boolean).map((p) => PROVIDER_LABELS[p] ?? p)].map((m) => <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700">{m}</span>)}</div></td>
            <td className="px-5 tabular-nums">{u.trips} {u.trips === 1 ? "trip" : "trips"}</td>
            <td className="whitespace-nowrap px-5">{day(u.lastSeenAt)}</td>
            <td className="px-5">{u.marketingOptIn
              ? <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[13px] font-medium text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Yes</span>
              : <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[13px] font-medium text-slate-600"><span className="size-1.5 rounded-full bg-slate-400" aria-hidden="true" />No</span>}</td>
            <td className="px-5"><div className="flex flex-wrap items-center gap-4"><AddBookingButton id={u.id} email={u.email} /><UserDeleteButton id={u.id} email={u.email} /></div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

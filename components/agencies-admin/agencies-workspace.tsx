"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpDown, Download, Eye, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type AgencyRow = { id: string; agencyName: string; contactName: string; email: string; phone: string; country: string; website: string | null; monthlyTransfers: string; message: string | null; status: string; createdAt: string };
type Tab = "all" | "new" | "contacted" | "approved" | "declined";
const TABS: [Tab, string][] = [["all", "All"], ["new", "To review"], ["contacted", "Contacted"], ["approved", "Approved"], ["declined", "Declined"]];
const PILL: Record<string, [string, string]> = {
  new: ["To review", "border-orange-300 bg-orange-50 text-orange-600 [--dot:#f97316]"],
  contacted: ["Contacted", "border-sky-300 bg-sky-50 text-sky-700 [--dot:#0ea5e9]"],
  approved: ["Approved", "border-emerald-300 bg-emerald-50 text-emerald-700 [--dot:#10b981]"],
  declined: ["Declined", "border-red-300 bg-red-50 text-red-600 [--dot:#ef4444]"],
};
function Pill({ status }: { status: string }) {
  const [label, cls] = PILL[status] ?? [status, PILL.contacted[1]];
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13px] font-medium ${cls}`}><span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />{label}</span>;
}
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
function StatCard({ label, value, sub, warn }: { label: string; value: number; sub: string; warn?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <p className="text-[15px] text-slate-700">{label}</p>
    <p className="mt-4 text-[36px] font-semibold leading-none tracking-[-.02em] tabular-nums">{value}</p>
    <p className={`mt-4 text-[14px] ${warn ? "font-medium text-orange-600" : "text-slate-500"}`}>{sub}</p>
  </div>;
}
const iconBtn = "grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

// Travel agency applications from /agencies, in the same layout as Drivers.
export function AgenciesWorkspace({ rows, subscribers }: { rows: AgencyRow[]; subscribers: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [oldest, setOldest] = useState(false);
  const [viewing, setViewing] = useState<AgencyRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => (tab === "all" || r.status === tab) && (!q || [r.agencyName, r.contactName, r.email, r.phone, r.country].some((v) => v.toLowerCase().includes(q))));
    return oldest ? [...list].reverse() : list;
  }, [rows, tab, query, oldest]);

  async function setStatus(row: AgencyRow, status: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/agency-applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, status }) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Status could not be saved.");
      setViewing({ ...row, status });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Status could not be saved."); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    const cell = (v: string) => { const safe = /^[=+\-@]/.test(v) && !/^[+\d\s()-]+$/.test(v) ? `'${v}` : v; return `"${safe.replaceAll('"', '""')}"`; };
    const lines = [["Agency", "Contact", "Email", "Phone", "Country", "Website", "Transfers per month", "Received", "Status"], ...shown.map((r) => [r.agencyName, r.contactName, r.email, r.phone, r.country, r.website ?? "", r.monthlyTransfers, r.createdAt.slice(0, 10), r.status])];
    const url = URL.createObjectURL(new Blob([lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `waydidi-travel-agencies-${tab}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="px-4 pb-10 pt-4 sm:px-8">
    <div className="-mt-[52px] mb-6 flex justify-end gap-2 max-md:mt-0">
      <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 hover:bg-slate-50"><Download size={16} />Export</button>
    </div>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label="Total applications" value={rows.length} sub="From the Travel agencies page" />
      <StatCard label="To review" value={count("new")} sub="Reply within 2 working days" warn={count("new") > 0} />
      <StatCard label="Approved partners" value={count("approved")} sub={`${count("contacted")} contacted`} />
      <StatCard label="Newsletter sign-ups" value={subscribers} sub="All time" />
    </div>

    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Filter" className="inline-flex flex-wrap rounded-xl bg-[#E8EAEE] p-1">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-9 rounded-lg px-4 text-[15px] ${tab === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}>
          {label}{id === "new" && count("new") > 0 && <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 text-[12px] font-semibold text-orange-700">{count("new")}</span>}
        </button>)}
      </div>
      <div className="flex items-center gap-2">
        {searchOpen && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Agency, contact, email, country" aria-label="Search agencies" className="h-10 w-56 rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:border-[#FF8A05]" />}
        <button type="button" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }} aria-label={searchOpen ? "Close search" : "Search"} className={iconBtn}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>
        <button type="button" onClick={() => setOldest((v) => !v)} aria-label={oldest ? "Sort: oldest first" : "Sort: newest first"} title={oldest ? "Oldest first" : "Newest first"} className={iconBtn}><ArrowUpDown size={17} /></button>
      </div>
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[980px] text-left text-[15px]">
        <thead className="bg-slate-50 text-slate-600"><tr>{["Agency", "Contact", "Phone", "Country", "Transfers / month", "Received", "Status", "Action"].map((h) => <th key={h} className="h-14 px-5 font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-500">{rows.length ? "No agencies match." : "No applications yet."}</td></tr>}
          {shown.map((r) => <tr key={r.id} className="border-t border-slate-100">
            <td className="h-[72px] px-5"><p className="font-medium text-[#15161C]">{r.agencyName}</p>{r.website && <p className="max-w-[220px] truncate text-[13px] text-slate-500">{r.website.replace(/^https?:\/\//, "")}</p>}</td>
            <td className="px-5"><p>{r.contactName}</p><p className="text-[13px] text-slate-500">{r.email}</p></td>
            <td className="whitespace-nowrap px-5 tabular-nums">{r.phone}</td>
            <td className="px-5">{r.country}</td>
            <td className="px-5">{r.monthlyTransfers}</td>
            <td className="whitespace-nowrap px-5">{day(r.createdAt)}</td>
            <td className="px-5"><Pill status={r.status} /></td>
            <td className="px-5"><button type="button" onClick={() => setViewing(r)} aria-label={`Review ${r.agencyName}`} title="Review application" className="text-slate-500 hover:text-[#C96100]"><Eye size={19} /></button></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <Dialog open={viewing != null} onOpenChange={(o) => { if (!o) setViewing(null); }}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 text-[#15161C] sm:max-w-xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 text-left">
          <div className="min-w-0"><DialogTitle className="truncate text-[24px] font-semibold">{viewing?.agencyName}</DialogTitle><DialogDescription>{viewing && `${viewing.country} · applied ${day(viewing.createdAt)}`}</DialogDescription></div>
          <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-orange-50"><X size={22} /></button>
        </DialogHeader>
        {viewing && <div className="grid gap-4 py-3 text-[15px]">
          <dl className="grid grid-cols-2 gap-3">
            {[["Contact", viewing.contactName], ["Email", viewing.email], ["Phone", viewing.phone], ["Transfers / month", viewing.monthlyTransfers], ["Website", viewing.website || "N/A"], ["Country", viewing.country]].map(([k, v]) =>
              <div key={k} className="min-w-0 rounded-xl bg-slate-50 p-3"><dt className="text-[12px] text-slate-500">{k}</dt><dd className="break-words font-medium">{v}</dd></div>)}
          </dl>
          {viewing.message && <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-slate-700">{viewing.message}</p>}
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] text-slate-500">Status</span><Pill status={viewing.status} /></div>
          <div className="flex flex-wrap gap-2">
            {(["contacted", "approved", "declined"] as const).filter((s) => s !== viewing.status).map((s) =>
              <button key={s} type="button" disabled={busy} onClick={() => setStatus(viewing, s)} className="h-10 rounded-full border border-slate-200 px-4 font-medium hover:border-[#FF8A05] disabled:opacity-50">Mark {PILL[s][0].toLowerCase()}</button>)}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}

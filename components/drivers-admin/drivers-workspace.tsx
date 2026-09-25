"use client";

import { ArrowUpDown, Car, Download, Eye, IdCard, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DriverCreateForm } from "@/components/driver-create-form";
import { DriverDeleteButton } from "@/components/driver-delete-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ApplicationRow, DriverManagement, DriverRow } from "@/lib/driver-management";

type Row = DriverRow | ApplicationRow;
type Tab = "all" | "active" | "inactive" | "applications";
const TABS: [Tab, string][] = [["all", "All"], ["active", "Active"], ["inactive", "Inactive"], ["applications", "Applications"]];
const SORTS = [["newest", "Newest first"], ["oldest", "Oldest first"], ["name", "Name A–Z"]] as const;
const VEHICLE: Record<string, string> = { sedan: "Sedan", suv: "SUV", van: "Van / minivan", none: "No vehicle yet" };

// Pill with a dot, like the reference table's Payment / Fulfilment chips.
const PILL: Record<string, [string, string]> = {
  active: ["Active", "border-emerald-300 bg-emerald-50 text-emerald-700 [--dot:#10b981]"],
  inactive: ["Inactive", "border-slate-300 bg-slate-50 text-slate-600 [--dot:#94a3b8]"],
  new: ["To review", "border-orange-300 bg-orange-50 text-orange-600 [--dot:#f97316]"],
  reviewed: ["Reviewed", "border-sky-300 bg-sky-50 text-sky-700 [--dot:#0ea5e9]"],
  approved: ["Approved", "border-emerald-300 bg-emerald-50 text-emerald-700 [--dot:#10b981]"],
  declined: ["Declined", "border-red-300 bg-red-50 text-red-600 [--dot:#ef4444]"],
};
function Pill({ status }: { status: string }) {
  const [label, cls] = PILL[status] ?? [status, PILL.inactive[1]];
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13px] font-medium ${cls}`}><span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />{label}</span>;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });

function StatCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: "warn" }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <p className="text-[15px] text-slate-700">{label}</p>
    <p className="mt-4 text-[36px] font-semibold leading-none tracking-[-.02em] tabular-nums">{value}</p>
    <p className={`mt-4 text-[14px] ${tone === "warn" ? "font-medium text-orange-600" : "text-slate-500"}`}>{sub}</p>
  </div>;
}

const iconBtn = "grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";

export function DriversWorkspace({ data, initialTab }: { data: DriverManagement; initialTab: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState(0);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<ApplicationRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { stats } = data;

  const rows = useMemo(() => {
    const base: Row[] = tab === "applications" ? data.applications
      : tab === "active" ? data.drivers.filter((d) => d.status === "active")
      : tab === "inactive" ? data.drivers.filter((d) => d.status !== "active")
      : [...data.drivers, ...data.applications.filter((a) => a.status !== "approved")];
    const q = query.trim().toLowerCase();
    const found = q ? base.filter((r) => [r.name, r.phone, r.email ?? "", r.area].some((v) => v.toLowerCase().includes(q))) : base;
    const key = SORTS[sort][0];
    return [...found].sort((a, b) => key === "name" ? a.name.localeCompare(b.name) : key === "oldest" ? a.joined.localeCompare(b.joined) : b.joined.localeCompare(a.joined));
  }, [data, tab, query, sort]);

  async function setStatus(app: ApplicationRow, status: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/driver-applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: app.id, status }) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Status could not be saved.");
      setViewing({ ...app, status });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Status could not be saved."); }
    finally { setBusy(false); }
  }

  function exportCsv() {
    const cell = (v: string | number) => { const s = String(v); const safe = /^[=+\-@]/.test(s) && !/^[+\d\s()-]+$/.test(s) ? `'${s}` : s; return `"${safe.replaceAll('"', '""')}"`; };
    const lines = [["Type", "Name", "Phone", "Email", "Area", "Vehicle", "Joined", "Status", "Trips"], ...rows.map((r) => [r.kind === "driver" ? "Driver" : "Application", r.name, r.phone, r.email ?? "", r.area, r.vehicle, r.joined.slice(0, 10), r.status, r.kind === "driver" ? r.trips : ""])];
    const url = URL.createObjectURL(new Blob([lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `waydidi-drivers-${tab}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="px-4 pb-10 pt-4 sm:px-8">
    {/* Actions */}
    <div className="-mt-[52px] mb-6 flex justify-end gap-2 max-md:mt-0">
      <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 hover:bg-slate-50"><Download size={16} />Export</button>
      <button type="button" onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 text-[15px] font-semibold text-white hover:bg-[#E67900]"><Plus size={17} strokeWidth={2.5} />Add driver</button>
    </div>

    {/* Numbers */}
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label="Total drivers" value={stats.total} sub={`${stats.active} active`} />
      <StatCard label="Applications to review" value={stats.toReview} sub={`${stats.applications} received in total`} tone={stats.toReview ? "warn" : undefined} />
      <StatCard label="Trips this month" value={stats.tripsThisMonth} sub="Rides with a driver, month to date" />
      <StatCard label="Rides without a driver" value={stats.unassignedNext7} sub="Next 7 days" tone={stats.unassignedNext7 ? "warn" : undefined} />
    </div>

    {/* Tabs + tools */}
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Filter" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-9 rounded-lg px-4 text-[15px] ${tab === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}>
          {label}{id === "applications" && stats.toReview > 0 && <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 text-[12px] font-semibold text-orange-700">{stats.toReview}</span>}
        </button>)}
      </div>
      <div className="flex items-center gap-2">
        {searchOpen && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email, area" aria-label="Search drivers" className="h-10 w-56 rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:border-[#FF8A05]" />}
        <button type="button" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }} aria-label={searchOpen ? "Close search" : "Search"} className={iconBtn}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>
        <button type="button" onClick={() => setSort((s) => (s + 1) % SORTS.length)} aria-label={`Sort: ${SORTS[sort][1]}`} title={`Sort: ${SORTS[sort][1]}`} className={iconBtn}><ArrowUpDown size={17} /></button>
      </div>
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

    {/* Table */}
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[980px] text-left text-[15px]">
        <thead className="bg-slate-50 text-slate-600"><tr>
          {["Driver", "Joined", "Phone", "Area", "Vehicle", "Type", "Trips", "Status", "Action"].map((h) => <th key={h} className="h-14 px-5 font-normal">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={9} className="px-5 py-14 text-center text-slate-500">{query ? "No drivers match your search." : tab === "applications" ? "No applications yet." : "No drivers yet. Tap Add driver to create one."}</td></tr>}
          {rows.map((r) => <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-100">
            <td className="h-[72px] px-5"><p className="font-medium text-[#15161C]">{r.name}</p>{r.email && <p className="text-[13px] text-slate-500">{r.email}</p>}</td>
            <td className="px-5 whitespace-nowrap">{day(r.joined)}</td>
            <td className="px-5 whitespace-nowrap tabular-nums">{r.phone}</td>
            <td className="px-5">{r.area || "N/A"}</td>
            <td className="px-5">{VEHICLE[r.vehicle] ?? (r.vehicle || "N/A")}</td>
            <td className="px-5 whitespace-nowrap">{r.kind === "driver" ? "Driver" : r.applicantType === "fleet" ? `Fleet${r.fleetSize ? ` · ${r.fleetSize}` : ""}` : "Applicant"}</td>
            <td className="px-5 tabular-nums">{r.kind === "driver" ? `${r.trips} ${r.trips === 1 ? "trip" : "trips"}` : "N/A"}</td>
            <td className="px-5"><Pill status={r.status} /></td>
            <td className="px-5">
              {r.kind === "driver"
                ? <div className="flex items-center gap-3 text-slate-500">
                    <a href={`/api/admin/driver-images/${r.id}/identity`} target="_blank" rel="noreferrer" aria-label={`ID card of ${r.name}`} title="ID card" className={r.hasId ? "hover:text-[#C96100]" : "pointer-events-none opacity-30"}><IdCard size={19} /></a>
                    <a href={`/api/admin/driver-images/${r.id}/vehicle`} target="_blank" rel="noreferrer" aria-label={`Car photo of ${r.name}`} title="Car photo" className={r.hasCar ? "hover:text-[#C96100]" : "pointer-events-none opacity-30"}><Car size={19} /></a>
                    <DriverDeleteButton driverId={r.id} driverName={r.name} onDeleted={() => router.refresh()} />
                  </div>
                : <button type="button" onClick={() => setViewing(r)} aria-label={`Review ${r.name}`} title="Review application" className="text-slate-500 hover:text-[#C96100]"><Eye size={19} /></button>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {/* Add driver */}
    <Dialog open={adding} onOpenChange={setAdding}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[28px] border-0 bg-white sm:max-w-2xl">
        <DialogHeader><DialogTitle className="text-2xl font-black">Add driver</DialogTitle><DialogDescription>Enter identity, vehicle, location, licence, and payment details.</DialogDescription></DialogHeader>
        <DriverCreateForm onCreated={() => { setAdding(false); router.refresh(); }} />
      </DialogContent>
    </Dialog>

    {/* Application details */}
    <Sheet open={viewing != null} onOpenChange={(o) => { if (!o) setViewing(null); }}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[92dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-[#15161C] sm:px-8 lg:left-1/2 lg:max-w-xl lg:-translate-x-1/2">
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-0 pb-2 pt-5 text-left">
          <div className="min-w-0"><SheetTitle className="truncate text-[24px] font-semibold">{viewing?.name}</SheetTitle><SheetDescription>{viewing && `${viewing.applicantType === "fleet" ? "Fleet owner" : "Individual driver"} · applied ${day(viewing.joined)}`}</SheetDescription></div>
          <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-orange-50"><X size={22} /></button>
        </SheetHeader>
        {viewing && <div className="grid gap-4 py-3 text-[15px]">
          <dl className="grid grid-cols-2 gap-3">
            {[["Phone", viewing.phone], ["Email", viewing.email], ["Area", viewing.area], ["Vehicle", `${VEHICLE[viewing.vehicle] ?? viewing.vehicle}${viewing.vehicleYear ? ` (${viewing.vehicleYear})` : ""}`], ["Languages", viewing.languages || "N/A"], ["Fleet size", viewing.fleetSize || "N/A"]].map(([k, v]) =>
              <div key={k} className="min-w-0 rounded-xl bg-slate-50 p-3"><dt className="text-[12px] text-slate-500">{k}</dt><dd className="break-words font-medium">{v}</dd></div>)}
          </dl>
          {viewing.message && <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-slate-700">{viewing.message}</p>}
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] text-slate-500">Status</span><Pill status={viewing.status} /></div>
          <div className="flex flex-wrap gap-2">
            {(["reviewed", "approved", "declined"] as const).filter((s) => s !== viewing.status).map((s) =>
              <button key={s} type="button" disabled={busy} onClick={() => setStatus(viewing, s)} className="h-10 rounded-full border border-slate-200 px-4 font-medium hover:border-[#FF8A05] disabled:opacity-50">Mark {PILL[s][0].toLowerCase()}</button>)}
            {viewing.status === "approved" && <button type="button" onClick={() => { setViewing(null); setAdding(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 font-semibold text-white"><Plus size={16} />Add as driver</button>}
          </div>
        </div>}
      </SheetContent>
    </Sheet>
  </div>;
}

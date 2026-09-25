"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Booking = {
  reference: string; serviceType?: string; pickup: string; dropoff: string; pickupDate: string; pickupTime: string;
  status: string; paymentMethod: string; customerName: string; assignment: { driverId: string; currentStatus: string } | null;
};
type Driver = { id: string; fullName: string };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS: Record<string, [string, string]> = {
  confirmed: ["Confirmed", "bg-[#DBEDDB] text-[#1C3829]"],
  pending_payment: ["Pending payment", "bg-[#FDECC8] text-[#402C1B]"],
  completed: ["Completed", "bg-[#D3E5EF] text-[#183347]"],
  no_show: ["No-show", "bg-[#E3E2E0] text-[#32302C]"],
  cancelled: ["Cancelled", "bg-[#E3E2E0] text-[#32302C]"],
};
const PAYMENT: Record<string, string> = { stripe: "Card", card: "Card", cash: "Cash" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (value: string, n: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
function monthGrid(month: string) {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (month: string, n: number) => { const d = new Date(`${month}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return iso(d).slice(0, 7); };

// Filter chip with a Notion-style tick list.
function FilterChip({ label, options, selected, onChange }: { label: string; options: [string, string, string?][]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const active = selected.length > 0;
  const summary = active ? selected.map((v) => options.find((o) => o[0] === v)?.[1] ?? v).join(", ") : "";
  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${active ? "border-transparent bg-[#FFF0DF] text-[#C96100]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
      <span className="truncate">{label}{active ? `: ${summary}` : ""}</span>
      {active ? <X size={13} onClick={(e) => { e.stopPropagation(); onChange([]); }} aria-label={`Clear ${label}`} /> : <ChevronDown size={13} />}
    </button>
    {open && <div className="absolute left-0 top-9 z-30 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
      <p className="px-2 pb-1 pt-0.5 text-[12px] text-slate-400">{label} is</p>
      <div className="max-h-64 overflow-y-auto">
        {options.map(([value, text, tag]) => { const on = selected.includes(value); return <button key={value} type="button" onClick={() => onChange(on ? selected.filter((v) => v !== value) : [...selected, value])} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px] hover:bg-slate-50">
          <span className={`grid size-3.5 shrink-0 place-items-center rounded-[3px] border ${on ? "border-[#FF8A05] bg-[#FF8A05] text-white" : "border-slate-400"}`}>{on && <Check size={10} strokeWidth={3.5} />}</span>
          <span className={tag ? `rounded-[3px] px-1.5 text-[12.5px] ${tag}` : ""}>{text}</span>
        </button>; })}
      </div>
    </div>}
  </div>;
}

// Notion-style month calendar for one service type, with filter chips.
export function NotionCalendar({ serviceType, view = "calendar" }: { serviceType: "transfer" | "hourly" | "tour"; view?: "calendar" | "board" }) {
  const [month, setMonth] = useState(() => bangkokToday().slice(0, 7));
  const [data, setData] = useState<{ bookings: Booking[]; drivers: Driver[] } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<string[]>([]);
  const [payment, setPayment] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const days = useMemo(() => monthGrid(month), [month]);
  const today = bangkokToday();

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the loader while a new month loads
    setData(null); setError("");
    fetch(`/api/admin/calendar?from=${days[0]}&to=${days[41]}`, { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Calendar unavailable."); return d; })
      .then((d) => { if (live) setData({ bookings: d.bookings, drivers: d.drivers }); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Calendar unavailable."); });
    return () => { live = false; };
  }, [days]);

  const byDay = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Booking[]>();
    for (const b of data?.bookings ?? []) {
      if ((b.serviceType ?? "transfer") !== serviceType) continue;
      if (status.length && !status.includes(b.status)) continue;
      if (drivers.length && !drivers.includes(b.assignment?.driverId ?? "none")) continue;
      if (payment.length && !payment.includes(PAYMENT[b.paymentMethod] ?? b.paymentMethod)) continue;
      if (q && ![b.reference, b.customerName, b.pickup, b.dropoff].join(" ").toLowerCase().includes(q)) continue;
      map.set(b.pickupDate, [...(map.get(b.pickupDate) ?? []), b]);
    }
    for (const list of map.values()) list.sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
    return map;
  }, [data, serviceType, status, drivers, payment, query]);
  const driverName = (id?: string) => data?.drivers.find((d) => d.id === id)?.fullName;
  const card = (b: Booking, withDate = false) => { const st = STATUS[b.status] ?? [b.status, STATUS.cancelled[1]]; const dn = driverName(b.assignment?.driverId); return <Link key={b.reference} href={`/admin/journeys/${encodeURIComponent(b.reference)}`} className="block rounded border border-slate-200 bg-white px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:bg-slate-50">
    <b className="block truncate text-[12.5px] font-semibold">{b.reference} {withDate ? `${Number(b.pickupDate.slice(8))} ${new Date(`${b.pickupDate}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })} · ` : ""}{b.pickupTime}</b>
    <span className="block truncate text-[11.5px] text-slate-500">{b.pickup} → {b.dropoff}</span>
    <span className="mt-0.5 flex flex-wrap gap-1">
      <i className={`rounded-[3px] px-1.5 text-[11px] not-italic leading-[18px] ${st[1]}`}>{st[0]}</i>
      <i className={`rounded-[3px] px-1.5 text-[11px] not-italic leading-[18px] ${dn ? "bg-[#E3E2E0] text-[#32302C]" : "bg-[#FFE2DD] text-[#5D1715]"}`}>{dn ?? "No driver"}</i>
    </span>
  </Link>; };
  // Board: this month's bookings grouped by where the ride is.
  const inMonth = [...byDay.entries()].filter(([d]) => d.slice(0, 7) === month).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, l]) => l);
  const MOVING = ["going_to_standby", "standby", "passenger_verified", "trip_started", "passenger_picked_up"];
  const columns: [string, string, (b: Booking) => boolean][] = [
    ["No driver", "bg-[#FFE2DD] text-[#5D1715]", (b) => !b.assignment && ["confirmed", "pending_payment"].includes(b.status)],
    ["Driver assigned", "bg-[#D3E5EF] text-[#183347]", (b) => b.assignment?.currentStatus === "assigned" && b.status !== "completed"],
    ["In progress", "bg-[#FDECC8] text-[#402C1B]", (b) => MOVING.includes(b.assignment?.currentStatus ?? "")],
    ["Completed", "bg-[#DBEDDB] text-[#1C3829]", (b) => b.status === "completed" || b.assignment?.currentStatus === "completed"],
    ["Cancelled / no-show", "bg-[#E3E2E0] text-[#32302C]", () => true],
  ];
  const placed = new Set<string>();
  const board = columns.map(([title, tag, test]) => ({ title, tag, items: inMonth.filter((b) => { if (placed.has(b.reference) || !test(b)) return false; placed.add(b.reference); return true; }) }));
  const anyFilter = status.length + drivers.length + payment.length > 0 || query;

  return <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-[#37352F] sm:p-5">
    {/* Filters */}
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip label="Status" selected={status} onChange={setStatus} options={Object.entries(STATUS).map(([k, [t, c]]) => [k, t, c])} />
      <FilterChip label="Driver" selected={drivers} onChange={setDrivers} options={[["none", "No driver", "bg-[#FFE2DD] text-[#5D1715]"], ...(data?.drivers ?? []).map((d): [string, string] => [d.id, d.fullName])]} />
      <FilterChip label="Payment" selected={payment} onChange={setPayment} options={[["Card", "Card"], ["Cash", "Cash"]]} />
      {anyFilter && <button type="button" onClick={() => { setStatus([]); setDrivers([]); setPayment([]); setQuery(""); setSearchOpen(false); }} className="px-2 text-[13px] text-slate-500 hover:text-slate-800">Clear</button>}
      <div className="ml-auto flex items-center gap-1">
        {searchOpen && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Reference, customer, place" aria-label="Search bookings" className="h-8 w-52 rounded-md border border-slate-200 px-2.5 text-[13px] outline-none focus:border-[#FF8A05]" />}
        <button type="button" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }} aria-label={searchOpen ? "Close search" : "Search"} className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100">{searchOpen ? <X size={16} /> : <Search size={16} />}</button>
      </div>
    </div>

    {/* Month */}
    <div className="mt-4 flex items-center justify-between">
      <h2 className="text-[16px] font-semibold">{monthLabel(month)}</h2>
      <div className="flex items-center gap-0.5 text-[14px] text-slate-600">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid size-8 place-items-center rounded-md hover:bg-slate-100"><ChevronLeft size={17} /></button>
        <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="rounded-md px-2.5 py-1 hover:bg-slate-100">Today</button>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="grid size-8 place-items-center rounded-md hover:bg-slate-100"><ChevronRight size={17} /></button>
      </div>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

    {view === "board" ? <div className="mt-3 overflow-x-auto pb-1">
      <div className="relative grid min-w-[1000px] grid-cols-5 gap-3">
        {board.map((c) => <section key={c.title} aria-label={c.title} className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-2 px-1 py-1 text-[13px]"><span className={`rounded-[3px] px-1.5 leading-[20px] ${c.tag}`}>{c.title}</span><span className="text-slate-400">{c.items.length}</span></h3>
          {c.items.map((b) => card(b, true))}
          {c.items.length === 0 && <p className="rounded border border-dashed border-slate-200 px-2 py-4 text-center text-[12px] text-slate-400">No bookings</p>}
        </section>)}
        {!data && !error && <div className="absolute inset-0 grid place-items-center bg-white/60"><LoaderCircle className="animate-spin text-[#FF8A05]" size={26} /></div>}
      </div>
    </div> :
    <div className="mt-2 overflow-x-auto">
      <div className="relative grid min-w-[910px] grid-cols-7 border-l border-t border-slate-200">
        {DOW.map((d) => <div key={d} className="border-b border-r border-slate-200 px-2 py-1.5 text-[12px] text-slate-400">{d}</div>)}
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const out = day.slice(0, 7) !== month;
          const show = expanded === day ? list : list.slice(0, 3);
          return <div key={day} className={`flex min-h-[122px] flex-col gap-1 border-b border-r border-slate-200 px-1.5 pb-1.5 pt-1 ${out ? "bg-slate-50/70" : ""}`}>
            <span className={`grid size-6 place-items-center self-end rounded-full text-[12px] ${day === today ? "bg-[#EB5757] font-semibold text-white" : out ? "text-slate-400" : "text-slate-600"}`}>{Number(day.slice(8))}</span>
            {show.map((b) => card(b))}
            {list.length > 3 && <button type="button" onClick={() => setExpanded(expanded === day ? null : day)} className="px-1 text-left text-[12px] text-slate-400 hover:text-slate-700">{expanded === day ? "Show less" : `${list.length - 3} more`}</button>}
          </div>;
        })}
        {!data && !error && <div className="absolute inset-0 grid place-items-center bg-white/60"><LoaderCircle className="animate-spin text-[#FF8A05]" size={26} /></div>}
      </div>
    </div>}
  </div>;
}

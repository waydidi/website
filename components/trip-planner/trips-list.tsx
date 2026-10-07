"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Search, Send, Zap, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TripRow } from "@/lib/smart-trips";
import { VEHICLES } from "@/lib/vehicles";
import { PlacePicker } from "./place-picker";
import { STATUS_LABEL } from "./trip-workspace";
import { api, selectCls, btnPrimary, btnQuiet, Field, inputCls } from "./ui";

type Row = TripRow & { stopCount: number; agencyName: string | null; shared?: boolean };
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const niceDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export function TripsList({ mode, view, quoteId }: { mode: "admin" | "agency"; view: "trips" | "templates"; quoteId?: string }) {
  const base = mode === "admin" ? "/api/admin" : "/api/agency";
  const home = mode === "admin" ? "/admin/trips" : "/agency/trips";
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [when, setWhen] = useState("upcoming");
  const [area, setArea] = useState("");
  const [quoteFrom, setQuoteFrom] = useState<Row | null | "pick">(quoteId ? "pick" : null);
  const [error, setError] = useState("");
  const load = useCallback(async () => setRows((await api<{ trips: Row[] }>(`${base}/trips${view === "templates" ? "?view=templates" : ""}`, "GET")).trips), [base, view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRows(null); void load().catch((e: Error) => setError(e.message)); }, [load]);

  const today = bangkokToday();
  const areas = useMemo(() => [...new Set((rows ?? []).map((r) => r.area).filter(Boolean))].sort(), [rows]);
  const shown = (rows ?? []).filter((r) => {
    if (q && !`${r.ref} ${r.title} ${r.customerName ?? ""} ${r.customerEmail ?? ""} ${r.pickupText} ${r.agencyName ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (area && r.area !== area) return false;
    if (view === "templates") return true;
    if (status && r.status !== status) return false;
    if (when === "upcoming" && r.tripDate && r.tripDate < today) return false;
    if (when === "past" && (!r.tripDate || r.tripDate >= today)) return false;
    return true;
  });
  const templates = view === "templates" ? rows ?? [] : null;

  return <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className={mode === "admin" ? "sr-only" : "text-[28px] font-black tracking-[-.03em]"}>{view === "templates" ? "Quick quote templates" : mode === "agency" ? "Trip planner" : "Trip planner"}</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-slate-500">{view === "templates" ? "Ready-made days. Pick one, set the date, hotel and guest, and send a quote in about two minutes." : "Plan, check and send private day trips. Fixed sessions are anchors; everything else fits around them."}</p></div>
      <div className="flex flex-wrap gap-2">
        {mode === "agency" && <Link href={view === "templates" ? home : `${home}?view=templates`} className={btnQuiet}>{view === "templates" ? "All trips" : "Templates"}</Link>}
        <button type="button" onClick={() => setQuoteFrom("pick")} className={btnQuiet}><Zap size={16} />{mode === "admin" ? "Start from a package" : "Quick quote"}</button>
        <Link href={`${home}/new${view === "templates" ? "?template=1" : ""}`} className={btnPrimary}><Plus size={17} />{view === "templates" ? "New template" : "Create trip"}</Link>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      <label className="relative min-w-[240px] flex-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trips, customers or references" className={`${inputCls} pl-9`} /></label>
      {view === "trips" && <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectCls}`} aria-label="Status"><option value="">Any status</option>{Object.entries(STATUS_LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
      {view === "trips" && <select value={when} onChange={(e) => setWhen(e.target.value)} className={`${selectCls}`} aria-label="Trip date"><option value="upcoming">Upcoming and undated</option><option value="past">Past</option><option value="all">All dates</option></select>}
      {areas.length > 1 && <select value={area} onChange={(e) => setArea(e.target.value)} className={`${selectCls}`} aria-label="Destination"><option value="">All destinations</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>}
    </div>
    {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}

    <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600"><tr>{(view === "templates" ? ["Template", "Area", "Stops", "Hours", "Price", ""] : ["Trip", "Customer", "Date", "Route", "Stops", "Total", "Status", ""]).map((h) => <th key={h} className="h-12 px-4 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows === null && <tr><td colSpan={8} className="py-12 text-center"><LoaderCircle className="mx-auto animate-spin text-slate-400" /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-500">{view === "templates" ? "No templates yet. Save a good trip as a template to quote it again quickly." : "No trips yet."}</td></tr>}
          {shown.map((r) => <tr key={r.id} onClick={() => (r.shared ? setQuoteFrom(r) : router.push(`${home}/${r.id}`))} className="cursor-pointer hover:bg-orange-50/40">
            {view === "templates" ? <>
              <td className="px-4 py-3"><p className="font-semibold">{r.templateName || r.title}</p>{r.shared && <p className="text-[12px] text-slate-500">Waydidi template</p>}</td>
              <td className="px-4 py-3">{r.area || "—"}</td><td className="px-4 py-3">{r.stopCount}</td><td className="px-4 py-3">{r.durationHours} hr</td><td className="px-4 py-3">{thb(r.total)}</td>
              <td className="px-4 py-3 text-right"><button type="button" onClick={(e) => { e.stopPropagation(); setQuoteFrom(r); }} className="inline-flex items-center gap-1 font-semibold text-brand-darker hover:underline"><Zap size={14} />Quote</button></td>
            </> : <>
              <td className="px-4 py-3"><p className="font-semibold">{r.title}</p><p className="text-[12px] text-slate-500">{r.ref}{r.groupId ? ` · Day ${r.dayNumber}` : ""}{r.agencyName ? ` · ${r.agencyName}` : ""}</p></td>
              <td className="px-4 py-3">{r.customerName || "—"}{r.customerEmail && <p className="text-[12px] text-slate-500">{r.customerEmail}</p>}</td>
              <td className="whitespace-nowrap px-4 py-3">{niceDate(r.tripDate)}<p className="text-[12px] text-slate-500">{r.startTime} · {r.durationHours} hr</p></td>
              <td className="max-w-[220px] px-4 py-3"><p className="truncate">{r.area || r.pickupText || "—"}</p></td>
              <td className="px-4 py-3">{r.stopCount}</td>
              <td className="px-4 py-3">{thb(r.total)}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS_LABEL[r.status]?.[1] ?? ""}`}>{STATUS_LABEL[r.status]?.[0] ?? r.status}</span></td>
              <td className="px-4 py-3 text-right text-brand-darker">Open</td>
            </>}
          </tr>)}
        </tbody>
      </table></div>
    </section>
    {quoteFrom && <QuickQuote base={base} home={home} preset={quoteFrom === "pick" ? null : quoteFrom} presetId={quoteId} label={mode === "admin" ? "Package" : "Template"} templates={templates} onClose={() => setQuoteFrom(null)} />}
  </main>;
}

function QuickQuote({ base, home, preset, presetId, label, templates: known, onClose }: { base: string; home: string; preset: Row | null; presetId?: string; label: string; templates: Row[] | null; onClose: () => void }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Row[] | null>(known);
  const [template, setTemplate] = useState<Row | null>(preset);
  const [f, setF] = useState({ tripDate: "", startTime: preset?.startTime ?? "08:00", pickupText: "", pickupLat: null as number | null, pickupLng: null as number | null, adults: 2, children: 0, vehicle: "", customerName: "", customerEmail: "", customerPhone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!templates) void api<{ trips: Row[] }>(`${base}/trips?view=templates`, "GET").then((r) => {
    setTemplates(r.trips);
    // Opened from a package ("Quick quote" on the Packages page): pre-select its trip plan.
    const t = presetId ? r.trips.find((x) => x.id === presetId) : null;
    if (t) { setTemplate(t); setF((v) => ({ ...v, startTime: t.startTime })); }
  }); }, [base, templates, presetId]);
  async function create(send: boolean) {
    if (!template) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ id: string }>(`${base}/trips/${template.id}`, "POST", { action: "quote", ...f, vehicle: f.vehicle || undefined, customerName: f.customerName || null, customerEmail: f.customerEmail || null, customerPhone: f.customerPhone || null });
      if (send) await api(`${base}/trips/${r.id}`, "POST", { action: "send", note: "Quick quote", notify: Boolean(f.customerEmail) });
      router.push(`${home}/${r.id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div role="dialog" aria-modal="true" aria-labelledby="qq-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form onSubmit={(e) => { e.preventDefault(); void create(true); }} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 id="qq-title" className="flex items-center gap-2 text-[20px] font-bold"><Zap size={19} className="text-brand-text" />Quick quote</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={20} /></button></div>
      <div className="mt-4 grid gap-3">
        <Field label={label}><select required value={template?.id ?? ""} onChange={(e) => { const t = templates?.find((x) => x.id === e.target.value) ?? null; setTemplate(t); if (t) setF((v) => ({ ...v, startTime: t.startTime })); }} className={inputCls}><option value="">{templates ? "Choose a ready-made day" : "Loading…"}</option>{templates?.map((t) => <option key={t.id} value={t.id}>{t.templateName || t.title} · {t.durationHours} hr · THB {t.total.toLocaleString("en-US")}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" required min={bangkokToday()} value={f.tripDate} onChange={(e) => setF({ ...f, tripDate: e.target.value })} className={inputCls} /></Field>
          <Field label="Pickup time"><input type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label="Hotel / pickup"><PlacePicker value={f.pickupText} onChange={(p) => setF({ ...f, pickupText: p.text, pickupLat: p.lat ?? f.pickupLat, pickupLng: p.lng ?? f.pickupLng })} className={inputCls} placeholder="Search hotel" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Adults"><input type="number" min={1} max={30} value={f.adults} onChange={(e) => setF({ ...f, adults: Math.max(1, Number(e.target.value) || 1) })} className={inputCls} /></Field>
          <Field label="Children"><input type="number" min={0} max={20} value={f.children} onChange={(e) => setF({ ...f, children: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} /></Field>
          <Field label="Vehicle"><select value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} className={inputCls}><option value="">As template</option>{Object.entries(VEHICLES).map(([id, v]) => <option key={id} value={id}>{v.name}</option>)}</select></Field>
        </div>
        <Field label="Customer name"><input value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><input type="email" value={f.customerEmail} onChange={(e) => setF({ ...f, customerEmail: e.target.value })} className={inputCls} /></Field>
          <Field label="Phone"><input value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} className={inputCls} /></Field>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={busy || !template || !f.tripDate || f.pickupText.length < 2} onClick={() => void create(false)} className={`${btnQuiet} flex-1`}>Open to edit</button>
        <button type="submit" disabled={busy || !template || !f.tripDate || f.pickupText.length < 2} className={`${btnPrimary} flex-1`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}Create and send</button>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">Times are re-checked for the new date and hotel. “Create and send” emails the customer when an email is given.</p>
    </form>
  </div>;
}

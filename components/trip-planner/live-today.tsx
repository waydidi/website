"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, LoaderCircle, Navigation, Phone, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LiveStatus } from "@/lib/trip-live";
import { fmt } from "@/lib/trip-plan";
import { api, btnQuiet } from "./ui";

type LiveTrip = { id: string; ref: string; title: string; customerName: string | null; customerPhone: string | null; bookingReference: string | null; startTime: string; live: LiveStatus };
const STATE: Record<LiveStatus["state"], string> = { not_today: "Not today", before: "Not started", live: "On the road", done: "Finished" };

export function LiveToday() {
  const [trips, setTrips] = useState<LiveTrip[] | null>(null);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await api<{ trips: LiveTrip[]; at: string }>("/api/admin/trips/live", "GET");
    setTrips(r.trips); setAt(r.at); setError("");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((e: Error) => setError(e.message));
    const t = window.setInterval(() => void load().catch(() => undefined), 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  async function apply(trip: LiveTrip, change: { kind: string; stopId: string; minutes?: number }, label: string) {
    if (!confirm(`${label}? The customer's “Your day” page updates too.`)) return;
    setBusy(`${trip.id}${change.stopId}${change.kind}`);
    try { await api(`/api/admin/trips/${trip.id}`, "POST", { action: "live_adjust", change }); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  return <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="sr-only">Live today</h1><p className="max-w-2xl text-[14px] text-slate-500">Today&apos;s booked day trips. If a driver runs late, the stops now at risk (fixed sessions first) show here with ways to catch up. Updates every 30 seconds.</p></div>
      <button type="button" onClick={() => void load()} className={btnQuiet}><RefreshCw size={15} />Refresh{at && <span className="font-normal text-slate-500"> · {new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</span>}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
    {trips === null && <LoaderCircle className="mx-auto mt-12 animate-spin text-slate-400" />}
    {trips?.length === 0 && <p className="mt-12 text-center text-slate-500">No booked day trips today.</p>}
    <div className="mt-5 grid gap-4">
      {trips?.map((t) => { const l = t.live; const late = l.delayMin >= 10; return <article key={t.id} className={`rounded-3xl border bg-white p-5 shadow-sm ${l.risks.length ? "border-red-200" : late ? "border-amber-200" : "border-slate-200"}`}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div><Link href={`/admin/trips/${t.id}`} className="text-[18px] font-bold hover:underline">{t.title}</Link>
            <p className="text-[13px] text-slate-500">{t.ref}{t.bookingReference ? ` · booking ${t.bookingReference}` : ""} · {t.customerName ?? "Guest"}{t.customerPhone && <> · <a href={`tel:${t.customerPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-[#C96100]"><Phone size={12} />{t.customerPhone}</a></>}</p></div>
          <div className="flex flex-wrap gap-2 text-[13px] font-semibold">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{STATE[l.state]}</span>
            {l.state === "live" && <span className={`rounded-full px-2.5 py-1 ${late ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{l.delayMin > 0 ? `${l.delayMin} min late` : "On time"}</span>}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${l.driver ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}><Navigation size={12} />{l.driver ? `GPS ${new Date(l.driver.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}` : "No GPS yet"}</span>
          </div>
        </header>
        {l.state === "live" && <p className="mt-3 text-[14px]">{l.current ? <>At <b>{l.current.name}</b> until about {fmt(l.current.projectedEnd)}. </> : null}{l.next ? <>Next: <b>{l.next.name}</b>, arriving about {fmt(l.next.etaMin)}.</> : "Heading back."} Back around {fmt(l.returnAt)}.</p>}
        <ol className="mt-3 flex flex-wrap gap-1.5 text-[12px]">{l.stops.map((s) => <li key={s.id} className={`rounded-lg px-2 py-1 ${s.status === "done" ? "bg-slate-100 text-slate-400 line-through" : s.status === "current" ? "bg-[#211726] text-white" : s.status === "at_risk" ? "bg-red-100 font-semibold text-red-800" : s.status === "skipped" ? "bg-slate-100 text-slate-400" : "bg-orange-50 text-[#9A4D00]"}`}>
          {s.status === "skipped" ? "Skipped · " : ""}{fmt(s.projectedStart)} {s.name}{s.sessionTime ? ` (session ${s.sessionTime})` : ""}
          {s.status === "skipped" && <button type="button" onClick={() => void apply(t, { kind: "restore", stopId: s.id }, `Put ${s.name} back`)} className="ml-1 font-semibold text-[#C96100] underline">undo</button>}
        </li>)}</ol>
        {l.risks.length > 0 && <div className="mt-3 rounded-2xl bg-red-50 p-3"><p className="flex items-center gap-1.5 text-[14px] font-bold text-red-800"><AlertTriangle size={16} />At risk</p><ul className="mt-1 grid gap-0.5 text-[13px] text-red-800">{l.risks.map((r) => <li key={r}>• {r}</li>)}</ul></div>}
        {l.suggestions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{l.suggestions.map((sg) => <button key={sg.label} type="button" disabled={Boolean(busy)} onClick={() => void apply(t, { kind: sg.kind, stopId: sg.stopId, minutes: sg.minutes }, sg.label)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${sg.fixes ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700"}`}>
          {busy === `${t.id}${sg.stopId}${sg.kind}` ? <LoaderCircle size={13} className="animate-spin" /> : sg.fixes ? <CheckCircle2 size={13} /> : <Clock size={13} />}{sg.label}{sg.fixes ? " · fixes it" : ""}</button>)}</div>}
      </article>; })}
    </div>
  </main>;
}

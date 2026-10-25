"use client";
import { FormEvent, useEffect, useState } from "react";

type Counts = Record<"quote" | "details" | "payment" | "confirmed" | "incomplete", number>;
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export function BookingFunnelReport() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86400000 + 7 * 3600000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [service, setService] = useState("all");
  const [data, setData] = useState<{ enabled: boolean; counts: Counts } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError(""); setData(null);
    try {
      const response = await fetch("/api/admin/reports/funnel?" + new URLSearchParams({ from, to, service }), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Report unavailable");
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Report unavailable"); }
    finally { setBusy(false); }
  }
  // Initial date range only; subsequent edits apply on submit.
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stages = ["quote", "details", "payment", "confirmed"] as const;
  return <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Booking funnel">
    <div><h2 className="text-xl font-bold">Booking funnel</h2><p className="text-sm text-slate-600">Consented transfer and hourly journeys, grouped by quote date in Bangkok time. These are observed journeys, not all customers or bookings. Tours are excluded.</p></div>
    <form onSubmit={load} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1 text-sm"><label htmlFor="funnel-from">From</label><input id="funnel-from" type="date" required value={from} onChange={e => setFrom(e.target.value)} className="rounded border p-2" /></div>
      <div className="grid gap-1 text-sm"><label htmlFor="funnel-to">To</label><input id="funnel-to" type="date" required value={to} onChange={e => setTo(e.target.value)} className="rounded border p-2" /></div>
      <div className="grid gap-1 text-sm"><label htmlFor="funnel-service">Service</label><select id="funnel-service" value={service} onChange={e => setService(e.target.value)} className="rounded border p-2"><option value="all">All supported services</option><option value="transfer">Transfer</option><option value="hourly">Hourly</option></select></div>
      <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy ? "Loading…" : "Apply"}</button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data && <>{!data.enabled && <p className="text-sm text-amber-800">Collection is disabled. Retained observations may still appear.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Stage</th><th>Reached</th><th>Drop-off from previous</th></tr></thead><tbody>{stages.map((stage, index) => {
        const count = data.counts[stage], previous = index ? data.counts[stages[index - 1]] : 0;
        return <tr key={stage} className="border-t"><th className="py-3 capitalize">{stage}</th><td>{count}</td><td>{!index || !previous ? "—" : `${previous - count} (${Math.round((previous - count) * 100 / previous)}%)`}</td></tr>;
      })}</tbody></table></div>
      <p className="text-sm text-slate-600">{data.counts.incomplete} quoted journeys have missing intermediate observations. Conversion counts require every previous stage to have been observed. Recent cohorts can still complete. Retention: 90 days.</p>
    </>}
  </section>;
}

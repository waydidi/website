"use client";
import { FormEvent, useEffect, useState } from "react";
import { vitalRating, type VitalName } from "@/lib/web-monitoring-rules";

type Vital = { route: string; name: VitalName; device: string; samples: number; p75: number };
type ErrorRow = { route: string; errorType: string; file: string | null; line: number | null; column: number | null; device: string; count: number; lastSeen: string };
const bangkokDate = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
const display = (name: VitalName, value: number) => name === "CLS" ? (value / 1000).toFixed(2) : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;

export function WebMonitoringReport() {
  const [from, setFrom] = useState(() => bangkokDate(-6));
  const [to, setTo] = useState(() => bangkokDate(0));
  const [data, setData] = useState<{ enabled: boolean; vitals: Vital[]; errors: ErrorRow[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError(""); setData(null);
    try {
      const response = await fetch("/api/admin/reports/web-monitoring?" + new URLSearchParams({ from, to }), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Report unavailable");
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Report unavailable"); }
    finally { setBusy(false); }
  }
  // Initial date range only; subsequent edits apply on submit.
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Site speed and browser errors">
    <div><h2 className="text-xl font-bold">Site speed and browser errors</h2><p className="text-sm text-slate-600">From visitors who accepted analytics, so this is a sample rather than all customers. Speed shows the 75th percentile: three in four visits were this fast or faster. Retention: 30 days.</p></div>
    <form onSubmit={load} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1 text-sm"><label htmlFor="monitoring-from">From</label><input id="monitoring-from" type="date" required value={from} onChange={e => setFrom(e.target.value)} className="rounded border p-2" /></div>
      <div className="grid gap-1 text-sm"><label htmlFor="monitoring-to">To</label><input id="monitoring-to" type="date" required value={to} onChange={e => setTo(e.target.value)} className="rounded border p-2" /></div>
      <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy ? "Loading…" : "Apply"}</button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data && <>
      {!data.enabled && <p className="text-sm text-amber-800">Collection is disabled. Retained observations may still appear.</p>}
      <h3 className="font-semibold">Speed</h3>
      {data.vitals.length === 0 ? <p className="text-sm text-slate-600">No measurements in this period.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Page</th><th>Measure</th><th>Device</th><th>75th percentile</th><th>Rating</th><th>Samples</th></tr></thead><tbody>
        {data.vitals.map(row => <tr key={`${row.route}|${row.name}|${row.device}`} className="border-t"><td className="py-2">{row.route}</td><td>{row.name}</td><td>{row.device}</td><td>{display(row.name, row.p75)}</td><td>{vitalRating(row.name, row.p75)}</td><td>{row.samples}</td></tr>)}
      </tbody></table></div>}
      <h3 className="font-semibold">Browser errors</h3>
      {data.errors.length === 0 ? <p className="text-sm text-slate-600">No errors reported in this period.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Page</th><th>Type</th><th>Where</th><th>Device</th><th>Count</th><th>Last hour seen (UTC)</th></tr></thead><tbody>
        {data.errors.map(row => <tr key={`${row.route}|${row.errorType}|${row.file}|${row.line}|${row.column}|${row.device}`} className="border-t"><td className="py-2">{row.route}</td><td>{row.errorType}</td><td>{row.file ? `${row.file}:${row.line ?? "?"}:${row.column ?? "?"}` : "Unknown"}</td><td>{row.device}</td><td>{row.count}</td><td>{row.lastSeen.slice(0, 13).replace("T", " ")}:00</td></tr>)}
      </tbody></table></div>}
    </>}
  </section>;
}

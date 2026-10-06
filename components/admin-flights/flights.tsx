"use client";

import { useCallback, useEffect, useState } from "react";

type Data = {
  configured: boolean;
  settings: { dailyCap: number; usdPerCall: number; updatedBy: string | null; updatedAt: string | null };
  days: { day: string; calls: number }[];
  stats: { day: string; status: string; created_at: string; error: string | null }[];
  watch: { booking_reference: string; flight_number: string; last_eta: string | null; last_status: string | null; notified_at: string | null; checked_at: string | null; pickup_date: string | null; pickup_time: string | null }[];
  searches: { flight_number: string; searches: number }[];
  loadedAt: string;
};

const usd = (n: number) => `US$${n.toFixed(2)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "–");
const box = "rounded-2xl border border-slate-200 bg-white p-5";

export function AdminFlights() {
  const [data, setData] = useState<Data | null>(null);
  const [cap, setCap] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/flights", { cache: "no-store" });
    const d = await res.json() as Data & { error?: string };
    if (!res.ok) { setMsg(d.error ?? "Couldn't load."); return; }
    setData({ ...d, loadedAt: new Date().toISOString() }); setCap(String(d.settings.dailyCap)); setPrice(String(d.settings.usdPerCall));
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  async function post(body: object) {
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/flights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({})) as { error?: string | null; status?: string };
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "Couldn't save."); return; }
    setMsg(d.status ? (d.status === "done" ? "Stats built." : `Stats run failed: ${d.error ?? "unknown error"}`) : "Saved.");
    void load();
  }

  if (!data) return <p className="text-slate-500">{msg || "Loading…"}</p>;
  const utcToday = data.loadedAt.slice(0, 10);
  const month = utcToday.slice(0, 7);
  const todayCalls = data.days.find((d) => d.day === utcToday)?.calls ?? 0;
  const monthCalls = data.days.filter((d) => d.day.startsWith(month)).reduce((n, d) => n + d.calls, 0);
  const max = Math.max(1, ...data.days.map((d) => d.calls));
  const cost = (calls: number) => (data.settings.usdPerCall ? usd(calls * data.settings.usdPerCall) : "Set a price below");

  return <div className="grid gap-5">
    {!data.configured && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">The flight data key isn&apos;t set. Add <strong>AERODATABOX_KEY</strong> as a Secret in Cloudflare.</p>}

    <div className="grid gap-4 sm:grid-cols-3">
      <div className={box}><p className="text-sm text-slate-500">Calls today (UTC)</p><p className="mt-1 text-3xl font-black">{todayCalls}<span className="text-base font-semibold text-slate-400"> / {data.settings.dailyCap}</span></p><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#FE8B05]" style={{ width: `${Math.min(100, (todayCalls / Math.max(1, data.settings.dailyCap)) * 100)}%` }} /></div></div>
      <div className={box}><p className="text-sm text-slate-500">Calls this month</p><p className="mt-1 text-3xl font-black">{monthCalls}</p><p className="mt-1 text-sm text-slate-500">Estimated cost: <strong>{cost(monthCalls)}</strong></p></div>
      <div className={box}><p className="text-sm text-slate-500">Last 30 days</p><p className="mt-1 text-3xl font-black">{data.days.reduce((n, d) => n + d.calls, 0)}</p><p className="mt-1 text-sm text-slate-500">Estimated cost: <strong>{cost(data.days.reduce((n, d) => n + d.calls, 0))}</strong></p></div>
    </div>

    <section className={box}>
      <h2 className="text-lg font-bold">Calls per day</h2>
      {data.days.length ? <ul className="mt-3 grid gap-1.5">{data.days.map((d) => <li key={d.day} className="grid grid-cols-[92px_1fr_44px] items-center gap-3 text-sm">
        <span className="text-slate-500">{d.day.slice(5)}</span><span className="h-3 rounded-full bg-slate-100"><span className="block h-3 rounded-full bg-[#FE8B05]" style={{ width: `${(d.calls / max) * 100}%` }} /></span><span className="text-right font-semibold">{d.calls}</span>
      </li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No calls yet.</p>}
      <p className="mt-3 text-xs text-slate-500">Each call to AeroDataBox is counted. Repeat searches use saved results and aren&apos;t counted. A route search and each airport in the daily stats use 2 calls.</p>
    </section>

    <section className={box}>
      <h2 className="text-lg font-bold">Limits and price</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm"><span className="text-slate-600">Daily call limit</span><input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" className="h-11 rounded-lg border border-slate-300 px-3" /></label>
        <label className="grid gap-1 text-sm"><span className="text-slate-600">Price per call (US$)</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 0.002" className="h-11 rounded-lg border border-slate-300 px-3" /></label>
        <button type="button" disabled={busy} onClick={() => void post({ dailyCap: Number(cap), usdPerCall: Number(price) })} className="h-11 rounded-lg bg-[#211726] px-5 font-semibold text-white disabled:opacity-60">Save</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">When the limit is reached, searches show &quot;busy&quot; until midnight UTC (07:00 Thailand). Price per call = your plan&apos;s monthly price ÷ its included calls.{data.settings.updatedAt ? ` Last changed by ${data.settings.updatedBy ?? "staff"}, ${when(data.settings.updatedAt)}.` : ""}</p>
    </section>

    <section className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Daily stats (airports, airlines, routes)</h2>
        <button type="button" disabled={busy} onClick={() => void post({ action: "run-stats" })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60">{busy ? "Running…" : "Run yesterday's stats now (10 calls)"}</button></div>
      {data.stats.length ? <ul className="mt-3 divide-y divide-slate-100 text-sm">{data.stats.map((s) => <li key={s.day} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="font-semibold">{s.day}</span><span className={s.status === "done" ? "text-emerald-700" : s.status === "failed" ? "text-red-600" : "text-slate-500"}>{s.status === "done" ? "Built" : s.status === "failed" ? "Failed" : "Running"} · {when(s.created_at)}</span>
        {s.error && <span className="w-full break-all text-xs text-red-600">{s.error}</span>}
      </li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not run yet. It runs every night after 02:00 Thailand time.</p>}
    </section>

    <section className={box}>
      <h2 className="text-lg font-bold">Flight watch for bookings</h2>
      <p className="mt-1 text-sm text-slate-500">Bookings with a flight number are checked every 15 minutes from 6 hours before pickup. Delays of 30+ minutes, cancellations and diversions are posted in the Telegram group.</p>
      {data.watch.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-slate-500"><tr><th className="py-2">Booking</th><th>Flight</th><th>Pickup</th><th>Last notice</th><th>Checked</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{data.watch.map((w) => <tr key={w.booking_reference}>
          <td className="py-2 font-semibold">{w.booking_reference}</td>
          <td>{w.flight_number}</td><td>{w.pickup_date ? `${w.pickup_date.slice(5)} ${w.pickup_time}` : "–"}</td>
          <td>{w.notified_at ? `${w.last_status ?? ""} ${w.last_eta?.slice(11) ?? ""} · ${when(w.notified_at)}` : "None"}</td><td>{when(w.checked_at)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="mt-2 text-sm text-slate-500">No upcoming pickups with a flight number yet.</p>}
    </section>

    {data.searches.length > 0 && <section className={box}>
      <h2 className="text-lg font-bold">Most searched flights (30 days)</h2>
      <ul className="mt-3 flex flex-wrap gap-2">{data.searches.map((s) => <li key={s.flight_number} className="rounded-full bg-slate-100 px-3 py-1 text-sm"><strong>{s.flight_number}</strong> · {s.searches}</li>)}</ul>
    </section>}

    {msg && <p role="status" className="text-sm font-semibold text-[#C96100]">{msg}</p>}
  </div>;
}

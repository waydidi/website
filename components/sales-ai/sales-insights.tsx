"use client";

import { useCallback, useEffect, useState } from "react";

type Lead = { conversationId: string; publicId: string | null; channel: string | null; score: number; band: string; reasons: string[]; lastCustomerAt: string | null };
type Row = { group: string; quotes: number; closed: number; converted: number; accepted: number; open: number; declined: number; noDecision: number; quotedThb: number; wonThb: number; conversionRate: number | null; enoughData: boolean };
type Quote = { bundleId: string; channel: string; sentAt: string; trips: number; totalThb: number; route: string; outcome: string; reason: string | null; reasonSource: string | null; evidence: string | null };
type Analysis = { fromDay: string; toDay: string; reasons: string[]; total: Row | null; byChannel: Row[]; byRoute: Row[]; byVehicle: Row[]; bySize: Row[]; byLatency: Row[]; byWeek: Row[]; notWonThb: number; wonThb: number; quotes: Quote[] };

const SIGNAL: Record<string, string> = { specific_date: "Date", route: "Route", group_details: "Group", quote_request: "Asked price", payment_question: "Payment question", booking_link_request: "Wants to book",
  returning_customer: "Returning", intent: "Intent", postponed: "Postponed", declined: "Declined" };
const REASON: Record<string, string> = { pricing: "Price", plans_changed: "Plans changed", competitor: "Competitor", unavailable: "No car / supplier", response_delay: "Slow reply", payment_friction: "Payment problem", other: "Other", unknown: "Unknown" };
const OUTCOME: Record<string, string> = { converted: "Booked", accepted: "Accepted", open: "Still open", declined: "Declined", no_decision: "No decision" };
const BAND: Record<string, string> = { hot: "bg-danger-soft text-danger", warm: "bg-warning-soft text-warning", interested: "bg-brand-soft text-brand-deep", cold: "bg-slate-100 text-slate-700" };
const input = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm";
const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;
const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);
const bangkok = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

// Admin → Sales insights (owner only): leads by score, and on-demand lost-quote analysis. No scheduled reports.
export function SalesInsights() {
  const [tab, setTab] = useState<"leads" | "loss">("leads");
  return <div className="mx-auto max-w-6xl">
    <h1 className="text-2xl font-black tracking-[-.035em] text-plum">Sales insights</h1>
    <div role="tablist" className="mt-4 flex gap-2">
      {(["leads", "loss"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
        className={`h-10 min-h-tap rounded-lg px-4 text-sm font-bold ${tab === t ? "bg-brand text-ink" : "border border-slate-200 bg-white text-plum"}`}>{t === "leads" ? "Leads" : "Lost quotes"}</button>)}
    </div>
    {tab === "leads" ? <Leads /> : <Loss />}
  </div>;
}

function Leads() {
  const [data, setData] = useState<{ enabled: boolean; leads: Lead[] } | null>(null), [error, setError] = useState("");
  useEffect(() => { const t = setTimeout(() => void fetch("/api/admin/sales-insights?view=leads", { cache: "no-store" }).then(async (r) => { const out = await r.json(); if (!r.ok) throw new Error(out.error); setData(out); }).catch((e) => setError(e.message || "Couldn't load leads.")), 0); return () => clearTimeout(t); }, []);
  if (error) return <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm font-bold text-danger">{error}</p>;
  if (!data) return <p className="mt-6 text-sm text-slate-600" aria-busy="true">Loading…</p>;
  return <section className="mt-4">
    <p className="text-sm text-slate-600">Scores order who to look at first. They are rules of thumb from what customers said and did, not predictions, and they never change a price.{!data.enabled && " Lead scoring is off: set SALES_AI_LEADS=1 to start scoring new messages."}</p>
    {!data.leads.length ? <p className="mt-6 text-sm text-slate-600">No scored leads yet.</p> :
      <ul className="mt-4 grid gap-2">{data.leads.map((l) => <li key={l.conversationId} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-wider ${BAND[l.band] ?? BAND.cold}`}>{l.band}</span>
          <span className="text-lg font-black text-plum">{l.score}</span>
          <span className="font-bold text-plum">{l.publicId ?? l.conversationId.slice(0, 8)}</span><span className="text-slate-600">· {l.channel ?? "web"}</span>
          {l.lastCustomerAt && <span className="ml-auto text-xs text-slate-600">Last message {bangkok(l.lastCustomerAt)}</span>}
        </div>
        <p className="mt-1 text-slate-700">{l.reasons.map((r) => SIGNAL[r] ?? (r.startsWith("decay_") ? `quiet (−${r.slice(6)})` : r)).join(" · ") || "No signals yet"}</p>
        <a className="mt-1 inline-block text-xs font-bold text-brand-deep underline" href={`/admin/chat?id=${encodeURIComponent(l.conversationId)}`}>Open chat</a>
      </li>)}</ul>}
  </section>;
}

function Table({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.length) return null;
  return <section className="mt-6">
    <h2 className="text-base font-black text-plum">{title}</h2>
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold text-slate-700"><tr>{["", "Quotes", "Booked", "Accepted", "Declined", "No decision", "Still open", "Booked rate (closed)", "Quoted", "Won"].map((h) => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.group} className="border-t border-slate-100">
          <th scope="row" className="px-3 py-2 font-bold text-plum">{r.group}</th><td className="px-3 py-2">{r.quotes}</td><td className="px-3 py-2">{r.converted}</td><td className="px-3 py-2">{r.accepted}</td>
          <td className="px-3 py-2">{r.declined}</td><td className="px-3 py-2">{r.noDecision}</td><td className="px-3 py-2">{r.open}</td>
          <td className="px-3 py-2">{pct(r.conversionRate)}{!r.enoughData && <span className="ml-1 text-xs text-warning" title="Fewer than 20 closed quotes">(too few)</span>}</td>
          <td className="px-3 py-2">{baht(r.quotedThb)}</td><td className="px-3 py-2">{baht(r.wonThb)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function Loss() {
  const [range, setRange] = useState({ from: "", to: "" }), [data, setData] = useState<Analysis | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const load = useCallback(async (r: { from: string; to: string }) => {
    setBusy(true); setError("");
    try { const res = await fetch(`/api/admin/sales-insights?${new URLSearchParams(Object.entries(r).filter(([, v]) => v))}`, { cache: "no-store" }); const out = await res.json(); if (!res.ok) throw new Error(out.error); setData(out); setRange({ from: out.fromDay, to: out.toDay }); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load the analysis."); } finally { setBusy(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void load({ from: "", to: "" }), 0); return () => clearTimeout(t); }, [load]);
  async function label(bundleId: string, reason: string) {
    setMsg(""); const res = await fetch("/api/admin/sales-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId, reason }) });
    const out = await res.json().catch(() => ({})); if (!res.ok) { setError(out.error ?? "Not saved."); return; } setMsg("Saved."); await load(range);
  }
  return <section className="mt-4">
    <p className="text-sm text-slate-600">Quotes sent after owner approval, counted once each (revisions and multi-trip quotes included). A quote with no answer is "Still open" for 7 days, then "No decision"; it is never counted as lost just for being quiet. Rates use closed quotes only.</p>
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void load(range); }}>
      <label className="grid gap-1 text-xs font-bold text-slate-700">From<input type="date" className={input} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">To<input type="date" className={input} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      <button type="submit" disabled={busy} className="h-10 min-h-tap rounded-lg bg-brand px-4 text-sm font-bold text-ink hover:bg-brand-hover disabled:opacity-60">Show</button>
      {data && <a className="h-10 min-h-tap rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-plum" href={`/api/admin/sales-insights?format=csv&from=${range.from}&to=${range.to}`}>Export CSV</a>}
    </form>
    {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm font-bold text-danger">{error}</p>}
    {msg && <p role="status" className="mt-4 text-sm font-bold text-success">{msg}</p>}
    {data && !data.total && <p className="mt-6 text-sm text-slate-600">No quotes were sent in this period.</p>}
    {data?.total && <>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Quotes sent", String(data.total.quotes)], ["Booked rate (closed)", `${pct(data.total.conversionRate)}${data.total.enoughData ? "" : " · too few"}`], ["Won", baht(data.wonThb)], ["Quoted, not won", baht(data.notWonThb)]].map(([k, v]) =>
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-3"><dt className="text-xs font-bold text-slate-600">{k}</dt><dd className="mt-1 text-lg font-black text-plum">{v}</dd></div>)}
      </dl>
      <Table title="By week sent" rows={data.byWeek} /><Table title="By channel" rows={data.byChannel} /><Table title="By destination" rows={data.byRoute} />
      <Table title="By car" rows={data.byVehicle} /><Table title="By quote size" rows={data.bySize} /><Table title="By time to quote" rows={data.byLatency} />
      <section className="mt-6">
        <h2 className="text-base font-black text-plum">Quotes not booked</h2>
        <p className="text-sm text-slate-600">Reason: your label, else a reason the customer's own words suggest (inferred), else unknown. Correct any of them.</p>
        <ul className="mt-2 grid gap-2">{data.quotes.filter((q) => q.outcome === "declined" || q.outcome === "no_decision").map((q) => <li key={q.bundleId} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="font-bold text-plum">{q.route}</span><span className="text-slate-600">· {baht(q.totalThb)} · {q.trips} trip(s) · {bangkok(q.sentAt)} · {OUTCOME[q.outcome]}</span>
          <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-700">Reason{q.reasonSource ? ` (${q.reasonSource})` : ""}
            <select className={input} value={q.reason ?? "unknown"} onChange={(e) => void label(q.bundleId, e.target.value)}>{data.reasons.map((r) => <option key={r} value={r}>{REASON[r] ?? r}</option>)}</select></label>
        </li>)}</ul>
      </section>
    </>}
  </section>;
}

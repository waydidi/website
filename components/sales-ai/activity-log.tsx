"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string; created_at: string; event: string; status: string; actor: string; channel: string | null; conversation_id: string | null;
  model: string | null; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; cost_usd_micros: number | null; summary: string; detail_json: string | null;
};
type Data = { rows: Row[]; next: string | null; events: string[]; retentionDays: number; month: { calls: number; micros: number; unknown_cost: number; input_tokens: number; output_tokens: number } | null };
type Filters = { event: string; status: string; conversation: string; from: string; to: string };

const EVENT_LABEL: Record<string, string> = {
  inbound_message: "Customer message", media_received: "Photo / file received", delivery_status: "Delivery status", model_call: "AI reply",
  handover: "Handed to staff", send_suppressed: "Send stopped", send_failed: "Send failed", kill_switch: "Channel switched off",
};
const STATUS_STYLE: Record<string, string> = {
  ok: "bg-success-soft text-success", error: "bg-danger-soft text-danger", suppressed: "bg-warning-soft text-warning", skipped: "bg-slate-100 text-slate-700",
};
const input = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm";
const bangkok = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium" }).format(new Date(iso));
const usd = (micros: number | null) => (micros == null ? "unknown" : `$${(micros / 1e6).toFixed(4)}`);

// Admin → AI activity (owner only). Read-only: the log cannot be edited or deleted from here.
export function AiActivityLog() {
  const [filters, setFilters] = useState<Filters>({ event: "", status: "", conversation: "", from: "", to: "" });
  const [applied, setApplied] = useState<Filters>(filters);
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);

  const load = useCallback(async (f: Filters, before?: string) => {
    setBusy(true); setError("");
    try {
      const q = new URLSearchParams(Object.entries({ ...f, before: before ?? "" }).filter(([, v]) => v));
      const res = await fetch(`/api/admin/ai-activity?${q}`, { cache: "no-store" });
      const out = await res.json().catch(() => ({})) as Data & { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't load the activity log.");
      setData(out); setRows((prev) => (before ? [...prev, ...out.rows] : out.rows));
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load the activity log."); } finally { setBusy(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(applied), 0); return () => clearTimeout(t); }, [load, applied]);

  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return <div className="mx-auto max-w-6xl">
    <h1 className="text-2xl font-black tracking-[-.035em] text-plum">AI activity</h1>
    <p className="mt-1 text-sm text-slate-600">What Waydidi Assistant and the WhatsApp channel did, newest first. Contact details and keys are removed before anything is stored. Kept for {data?.retentionDays ?? 180} days. Times are Bangkok time.</p>

    {data?.month && <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[["AI calls this month", String(data.month.calls)], ["Estimated cost", usd(data.month.micros)], ["Calls with unknown cost", String(data.month.unknown_cost)], ["Tokens in / out", `${data.month.input_tokens.toLocaleString()} / ${data.month.output_tokens.toLocaleString()}`]].map(([k, v]) =>
        <div key={k} className="rounded-lg border border-slate-200 bg-white p-3"><dt className="text-xs font-bold text-slate-600">{k}</dt><dd className="mt-1 text-lg font-black text-plum">{v}</dd></div>)}
    </dl>}

    <form className="mt-5 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
      <label className="grid gap-1 text-xs font-bold text-slate-700">Event
        <select className={input} value={filters.event} onChange={set("event")}><option value="">All</option>{(data?.events ?? []).map((e) => <option key={e} value={e}>{EVENT_LABEL[e] ?? e}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">Result
        <select className={input} value={filters.status} onChange={set("status")}><option value="">All</option><option value="ok">OK</option><option value="error">Error</option><option value="suppressed">Stopped</option><option value="skipped">Skipped</option></select></label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">Conversation id
        <input className={input} value={filters.conversation} onChange={set("conversation")} maxLength={80} /></label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">From<input type="date" className={input} value={filters.from} onChange={set("from")} /></label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">To<input type="date" className={input} value={filters.to} onChange={set("to")} /></label>
      <button type="submit" disabled={busy} className="h-10 min-h-tap rounded-lg bg-brand px-4 text-sm font-bold text-ink hover:bg-brand-hover disabled:opacity-60">Search</button>
    </form>

    {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm font-bold text-danger">{error}</p>}
    {!error && !busy && data && !rows.length && <p className="mt-6 text-sm text-slate-600">No activity matches these filters.</p>}

    <ul className="mt-4 grid gap-2" aria-busy={busy}>
      {rows.map((r) => <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-wider ${STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-700"}`}>{r.status}</span>
          <span className="font-bold text-plum">{EVENT_LABEL[r.event] ?? r.event}</span>
          {r.channel && <span className="text-slate-600">· {r.channel}</span>}
          <time className="ml-auto text-xs text-slate-600" dateTime={r.created_at}>{bangkok(r.created_at)}</time>
        </div>
        <p className="mt-1 break-words text-slate-800">{r.summary}</p>
        <p className="mt-1 text-xs text-slate-600">
          {r.actor}{r.conversation_id && <> · chat <button type="button" className="font-bold text-brand-deep underline" onClick={() => { const f = { ...filters, conversation: r.conversation_id! }; setFilters(f); setApplied(f); }}>{r.conversation_id.slice(0, 12)}</button></>}
          {r.model && <> · {r.model} · {r.latency_ms ?? "?"} ms · {r.input_tokens ?? 0}/{r.output_tokens ?? 0} tokens · {usd(r.cost_usd_micros)}</>}
        </p>
      </li>)}
    </ul>
    {data?.next && <button type="button" disabled={busy} onClick={() => void load(applied, data.next!)} className="mt-4 h-10 min-h-tap rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-plum disabled:opacity-60">Load older</button>}
  </div>;
}

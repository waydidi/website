"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Alert = { id: string; title: string; message: string; areas: string; effect: "info" | "warn" | "stop"; starts_at: string; ends_at: string | null; source_url: string | null; active: number; created_by: string | null };
type Limits = { perChat: number; perCustomerDay: number; siteDay: number; spamMessages: number; spamMinutes: number; spamPauseMinutes: number };
type Data = { alerts: Alert[]; limits: Limits; today: { paid: number; cached: number; lastError: { status: number; detail: string; at: string } | null }; owner: boolean; now: string };
const EFFECTS: [Alert["effect"], string, string][] = [
  ["info", "Information", "Non mentions it when the topic comes up."],
  ["warn", "Warn customers", "Also shown as ⚠️ on price cards and place lists for these areas."],
  ["stop", "Stop selling", "Non won't quote or send payment links for these areas; it explains and hands over."],
];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const EMPTY = { id: "", title: "", message: "", areas: "", effect: "warn" as Alert["effect"], startsAt: today(), endsAt: "", sourceUrl: "" };
const input = "h-10 rounded-lg border border-slate-200 px-3 font-normal";
const LIMITS: [keyof Limits, string][] = [["perChat", "Place searches per chat"], ["perCustomerDay", "Per customer per day"], ["siteDay", "Whole website per day"], ["spamMessages", "Spam guard: messages"], ["spamMinutes", "…within minutes"]];

// Admin → Website chat → Alerts & limits.
export function ChatAlerts() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [msg, setMsg] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/cee/alerts", { cache: "no-store" });
    const out = await res.json().catch(() => ({})) as Data & { error?: string };
    if (!res.ok) { setError(out.error ?? "Couldn't load alerts."); return; }
    setData(out); setLimits(out.limits);
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true); setMsg(""); setError("");
    try {
      const res = await fetch("/api/admin/cee/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "That didn't work.");
      setMsg(done); await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't work."); return false; } finally { setBusy(false); }
  }
  async function save(e: FormEvent) { e.preventDefault(); if (await post({ action: "save", ...form, id: form.id || undefined, endsAt: form.endsAt || null }, "Alert saved. Non uses it from the next message.")) setForm(EMPTY); }
  if (!data) return error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p> : <p className="text-slate-500">Loading…</p>;
  const live = (a: Alert) => a.active && a.starts_at <= data.now && (!a.ends_at || a.ends_at > data.now);
  return <section className="grid gap-4 text-[14px]">
    {(msg || error) && <p role={error ? "alert" : "status"} className={`rounded-xl p-3 ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{error || msg}</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid content-start gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-[16px] font-bold">Alerts</h2>
          <p className="text-slate-600">Closures, flooding, protests, holidays, road works… Non checks these first on the website, WhatsApp and LINE, before your notes, prices or Google.</p></div>
        {!data.alerts.length && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">No alerts. Add one when something affects trips.</p>}
        {data.alerts.map((a) => <article key={a.id} className={`rounded-2xl border bg-white p-4 ${live(a) ? "border-amber-300" : "border-slate-200 opacity-70"}`}>
          <div className="flex flex-wrap items-center gap-2"><b className="flex-1">{a.title}</b>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${a.effect === "stop" ? "bg-red-50 text-red-700" : a.effect === "warn" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{EFFECTS.find(([k]) => k === a.effect)?.[1]}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px]">{live(a) ? "Live" : a.active && a.starts_at > data.now ? "Scheduled" : "Ended"}</span></div>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.message}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">{a.areas || "Everywhere"} · {a.starts_at.slice(0, 10)} → {a.ends_at ? a.ends_at.slice(0, 10) : "until ended"}{a.created_by ? ` · ${a.created_by}` : ""}</p>
          <div className="mt-2 flex gap-4 text-[13px] font-semibold">
            <button type="button" onClick={() => setForm({ id: a.id, title: a.title, message: a.message, areas: a.areas, effect: a.effect, startsAt: a.starts_at.slice(0, 10), endsAt: a.ends_at?.slice(0, 10) ?? "", sourceUrl: a.source_url ?? "" })} className="text-[#C96100]">Edit</button>
            {a.active ? <button type="button" disabled={busy} onClick={() => { if (window.confirm(`End “${a.title}” now?`)) void post({ action: "end", id: a.id }, "Alert ended."); }} className="text-red-700">End now</button> : null}
          </div>
        </article>)}
      </div>
      <div className="grid content-start gap-4">
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-[13px]">
          <h3 className="text-[15px] font-bold">{form.id ? "Edit alert" : "Add an alert"}</h3>
          <label className="grid gap-1 font-semibold">Title<input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Flooding in Ayutthaya" className={input} /></label>
          <label className="grid gap-1 font-semibold">What customers should know<textarea required maxLength={800} rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Some roads near the old city are flooded. Trips are running but may take longer; the team will confirm the route." className="rounded-lg border border-slate-200 p-2 font-normal" /></label>
          <label className="grid gap-1 font-semibold">Areas or places (comma separated, empty = everywhere)<input value={form.areas} onChange={(e) => setForm({ ...form, areas: e.target.value })} placeholder="Ayutthaya, Bang Pa-in" className={input} /></label>
          <fieldset className="grid gap-1.5"><legend className="mb-1 font-semibold">Effect</legend>
            {EFFECTS.map(([k, l, d]) => <label key={k} className="flex gap-2"><input type="radio" name="effect" checked={form.effect === k} onChange={() => setForm({ ...form, effect: k })} className="mt-1 accent-[#FF8A05]" /><span><b>{l}</b><br /><span className="text-slate-500">{d}</span></span></label>)}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 font-semibold">Starts<input type="date" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={input} /></label>
            <label className="grid gap-1 font-semibold">Ends (optional)<input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={input} /></label>
          </div>
          <label className="grid gap-1 font-semibold">Official source (optional)<input type="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://…" className={input} /></label>
          <div className="flex gap-2"><button disabled={busy} className="h-10 flex-1 rounded-full bg-[#FE8B05] font-bold text-white">{form.id ? "Save changes" : "Add alert"}</button>{form.id && <button type="button" onClick={() => setForm(EMPTY)} className="h-10 rounded-full border border-slate-200 px-4 font-semibold">Cancel</button>}</div>
        </form>
        {limits && <form onSubmit={(e) => { e.preventDefault(); void post({ action: "limits", limits }, "Limits saved."); }} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-[13px]">
          <h3 className="text-[15px] font-bold">Limits {data.owner ? "" : "(owner only)"}</h3>
          <p className="text-slate-600">Last 24 hours: {data.today.paid} paid place searches, {data.today.cached} free repeats (saved results).</p>
          {data.today.lastError && <p className="rounded-lg bg-red-50 p-2 text-[12.5px] text-red-800"><b>Last Google error ({data.today.lastError.status}, {new Date(data.today.lastError.at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}):</b> {data.today.lastError.detail || "no details"}</p>}
          <fieldset disabled={!data.owner || busy} className="grid grid-cols-2 gap-2">
            {LIMITS.map(([k, l]) => <label key={k} className="grid gap-1 font-semibold">{l}<input type="number" min={0} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} className={input} /></label>)}
          </fieldset>
          {data.owner && <button disabled={busy} className="h-10 rounded-full border border-slate-200 font-semibold">Save limits</button>}
        </form>}
      </div>
    </div>
  </section>;
}

"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = { id: string; topic_key: string; question: string; status: string; time_sensitive: number; collected_at: string; refreshed_at: string; hits: number; approved_by: string | null; facts: number };
type Data = { notes: string; whatsapp: string; blocked: string[]; keySet: boolean; maxNotes: number; knowledge: Entry[] };

const box = "rounded-2xl border border-slate-200 bg-white p-5";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-brand";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" });
const STATUS: Record<string, [string, string]> = { approved: ["In use", "bg-emerald-100 text-emerald-800"], review: ["Paused: check it", "bg-amber-100 text-amber-800"], retired: ["Retired", "bg-slate-100 text-slate-600"] };

// Admin → Writing assistant: the playbook behind /post in Telegram, and the saved knowledge the team approved.
export function WritingAssistant() {
  const [data, setData] = useState<Data | null>(null);
  const [notes, setNotes] = useState(""), [whatsapp, setWhatsapp] = useState(""), [blocked, setBlocked] = useState("");
  const [msg, setMsg] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/post-helper", { cache: "no-store" });
    const body = await res.json().catch(() => ({})) as Data & { error?: string };
    if (!res.ok) { setError(body.error ?? "Could not load."); return; }
    setData(body); setNotes(body.notes); setWhatsapp(body.whatsapp); setBlocked(body.blocked.join("\n"));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function post(payload: Record<string, unknown>, done: string) {
    setBusy(true); setMsg(""); setError("");
    const res = await fetch("/api/admin/post-helper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Could not save."); return; }
    setMsg(done); await load();
  }

  if (!data) return <p className={error ? "text-red-600" : "text-slate-500"}>{error || "Loading…"}</p>;
  return <div className="grid max-w-4xl gap-5">
    {!data.keySet && <p className="rounded-xl bg-amber-50 p-3 text-[14px] font-semibold text-amber-900">The assistant is off: add ANTHROPIC_API_KEY in Cloudflare.</p>}
    <section className={box}>
      <h2 className="text-[16px] font-bold">Playbook</h2>
      <p className="mt-1 text-[13px] text-slate-500">Paste your playbook (.md text). In Telegram, <b>/post</b> followed by a travel-group post gives a ready-to-post comment that follows it. Reference prices in the playbook are never used as quotes: prices come from the real price lookup only.</p>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={16} maxLength={data.maxNotes} aria-label="Playbook" className={`${field} mt-3 font-mono text-[13px]`} />
      <p className="mt-1 text-[12px] text-slate-500">{notes.length.toLocaleString("en-US")} / {data.maxNotes.toLocaleString("en-US")} characters</p>
      <label className="mt-3 grid gap-1 text-[13px] font-semibold">WhatsApp number in comments<input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={`${field} max-w-xs`} /></label>
      <label className="mt-3 grid gap-1 text-[13px] font-semibold">Sites never used as sources (one per line)<textarea value={blocked} onChange={(e) => setBlocked(e.target.value)} rows={5} className={`${field} font-mono text-[13px]`} /></label>
      <button type="button" disabled={busy} onClick={() => void post({ action: "save", notes, whatsapp, blocked: blocked.split(/\n|,/) }, "Saved. The next /post uses it.")} className="mt-4 h-10 rounded-full bg-brand px-5 text-[14px] font-semibold text-white disabled:opacity-60">Save</button>
      {msg && <p role="status" className="mt-2 text-[14px] font-semibold text-emerald-700">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-[14px] font-semibold text-red-700">{error}</p>}
    </section>
    <section className={box}>
      <h2 className="text-[16px] font-bold">Saved knowledge</h2>
      <p className="mt-1 text-[13px] text-slate-500">Answers a person approved in Telegram. They are used without a web search and refreshed after each 10 January and 10 July. "Paused" ones are not used until you approve them again.</p>
      {data.knowledge.length === 0 ? <p className="mt-3 text-[14px] text-slate-500">Nothing saved yet. After the same question has been asked 3 times, Telegram shows a Save button.</p> : <ul className="mt-3 grid gap-2">
        {data.knowledge.map((e) => <li key={e.id} className="rounded-xl border border-slate-200 p-3 text-[14px]">
          <p className="font-semibold">{e.question} <span className={`ml-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS[e.status]?.[1] ?? "bg-slate-100"}`}>{STATUS[e.status]?.[0] ?? e.status}</span></p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Source from {day(e.collected_at)} · refreshed {day(e.refreshed_at)} · {e.facts} fact{e.facts === 1 ? "" : "s"} · used {e.hits}× · {e.time_sensitive ? "time-sensitive" : "evergreen"}{e.approved_by ? ` · approved by ${e.approved_by}` : ""}</p>
          <div className="mt-2 flex gap-3 text-[13px] font-semibold">
            {e.status !== "approved" && <button type="button" disabled={busy} onClick={() => void post({ action: "approve", id: e.id }, "Approved.")} className="text-emerald-700 underline">Approve again</button>}
            {e.status !== "retired" && <button type="button" disabled={busy} onClick={() => void post({ action: "retire", id: e.id }, "Retired.")} className="text-slate-700 underline">Retire</button>}
            <button type="button" disabled={busy} onClick={() => { if (confirm("Delete this saved answer?")) void post({ action: "delete", id: e.id }, "Deleted."); }} className="text-red-700 underline">Delete</button>
          </div>
        </li>)}
      </ul>}
    </section>
  </div>;
}

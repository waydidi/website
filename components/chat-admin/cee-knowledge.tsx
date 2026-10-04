"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Note = { id: string; title: string; kind: string; city: string | null; body: string; active: number; source: string; created_by: string | null; updated_at: string };
type Data = {
  notes: Note[]; owner: boolean;
  cee: { enabled: boolean; keySet: boolean; mapsKeySet: boolean; mode: "auto" | "fast" | "smart"; models: { fast: string; smart: string }; usage: { replies: number; requests: number; smart: number; usd: number } };
  channels: { whatsapp: boolean; line: boolean };
};
const KINDS: [string, string][] = [["rule", "Rule"], ["faq", "FAQ"], ["tip", "Tip"], ["place", "Place"]];
const EMPTY = { id: "", title: "", kind: "faq", city: "", body: "", active: true };
const MODES: [Data["cee"]["mode"], string, string][] = [
  ["fast", "Haiku 4.5 (default)", "Cheapest and quickest: about 100–250 replies per $1."],
  ["auto", "Auto", "Haiku for most messages; the smarter model only for trip planning and complicated requests."],
  ["smart", "Smart only", "Best answers, slower and about 4× the cost."],
];
const input = "h-10 rounded-lg border border-slate-200 px-3 font-normal";

// Non's brain: notes staff write (rules, FAQs, tips, places), Markdown/Obsidian import, model and cost.
export function CeeKnowledge() {
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [active, setActive] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ q, kind, active });
    const res = await fetch(`/api/admin/cee/knowledge?${p}`, { cache: "no-store" });
    const out = await res.json().catch(() => ({})) as Data & { error?: string };
    if (!res.ok) { setError(out.error ?? "Couldn't load Non's knowledge."); return; }
    setData(out);
  }, [q, kind, active]);
  useEffect(() => { const t = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(t); }, [load]);

  async function post(body: Record<string, unknown>, done?: string) {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/admin/cee/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({})) as { error?: string; imported?: number };
      if (!res.ok) throw new Error(out.error ?? "That didn't work.");
      setMsg(out.imported ? `Imported ${out.imported} ${out.imported === 1 ? "note" : "notes"}.` : done ?? "Saved.");
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't work."); return false; }
    finally { setBusy(false); }
  }
  async function save(e: FormEvent) { e.preventDefault(); if (await post({ action: "save", ...form, id: form.id || undefined })) setForm(EMPTY); }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    let total = 0;
    for (const f of Array.from(files)) { const ok = await post({ action: "import", markdown: await f.text(), filename: f.name }); if (!ok) return; total++; }
    setMsg(`Imported ${total} ${total === 1 ? "file" : "files"}.`);
  }

  if (!data) return error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p> : <p className="text-slate-500">Loading…</p>;
  const u = data.cee.usage;
  return <section className="grid gap-4">
    <h2 className="sr-only">Non knowledge</h2>
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px]">
        <p className="text-[13px] font-semibold text-slate-500">Non status</p>
        <ul className="mt-2 grid gap-1.5">
          <li>{data.cee.keySet ? (data.cee.enabled ? "🟢 Answering chats" : "⚪ Switched off") : "🔴 Off: add ANTHROPIC_API_KEY in Cloudflare"}</li>
          <li>{data.cee.mapsKeySet ? "🟢 Route prices connected" : "🔴 No GOOGLE_MAPS_SERVER_KEY: transfers go to staff"}</li>
          <li>{data.channels.whatsapp ? "🟢 WhatsApp connected" : "⚪ WhatsApp not connected"}</li>
          <li>{data.channels.line ? "🟢 LINE connected" : "⚪ LINE not connected"}</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px]">
        <p className="text-[13px] font-semibold text-slate-500">This month</p>
        <p className="mt-1 text-[28px] font-bold">${u.usd.toFixed(2)}</p>
        <p className="text-slate-600">{u.replies} customer messages answered{u.replies ? ` · about $${(u.usd / u.replies).toFixed(3)} each` : ""}</p>
        <p className="text-[12.5px] text-slate-500">{u.smart} used the smart model. Estimated from token counts; your Anthropic bill is the final figure.</p>
      </div>
      <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px]" disabled={!data.owner || busy}>
        <legend className="px-1 text-[13px] font-semibold text-slate-500">AI model{data.owner ? "" : " (owner only)"}</legend>
        {MODES.map(([k, l, d]) => <label key={k} className="mt-2 flex gap-2"><input type="radio" name="cee-mode" checked={data.cee.mode === k} onChange={() => void post({ action: "mode", mode: k }, "Model updated.")} className="mt-1 accent-[#FE8B05]" /><span><b>{l}</b><br /><span className="text-[12.5px] text-slate-500">{d}</span></span></label>)}
      </fieldset>
    </section>

    {(msg || error) && <p role={error ? "alert" : "status"} className={`rounded-xl p-3 text-[14px] ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{error || msg}</p>}

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-[13px]">
          <label className="grid flex-1 gap-1 font-semibold">Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="baby seat, Thong Lor café…" className={input} /></label>
          <label className="grid gap-1 font-semibold">Type<select value={kind} onChange={(e) => setKind(e.target.value)} className={input}><option value="">All</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="grid gap-1 font-semibold">Show<select value={active} onChange={(e) => setActive(e.target.value)} className={input}><option value="">All</option><option value="1">Live</option><option value="0">Drafts</option></select></label>
        </div>
        <ul className="grid gap-2">
          {!data.notes.length && <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">No notes yet. Add Waydidi&apos;s rules first: child seats, tips, cash, waiting time, luggage.</li>}
          {data.notes.map((n) => <li key={n.id} className={`rounded-2xl border bg-white p-4 text-[14px] ${n.active ? "border-slate-200" : "border-amber-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <b className="min-w-0 flex-1">{n.title}</b>
              {!n.active && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800">Draft: Non doesn&apos;t use it</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px]">{KINDS.find(([k]) => k === n.kind)?.[1] ?? n.kind}{n.city ? ` · ${n.city}` : ""}</span>
            </div>
            <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-slate-700">{n.body}</p>
            <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-slate-500">
              <span>{n.source === "chat" ? "From a chat" : n.source === "markdown" ? "Imported" : "Added"}{n.created_by ? ` by ${n.created_by}` : ""} · {new Date(n.updated_at).toLocaleDateString()}</span>
              <button type="button" onClick={() => setForm({ id: n.id, title: n.title, kind: n.kind, city: n.city ?? "", body: n.body, active: Boolean(n.active) })} className="font-semibold text-[#C96100]">Edit</button>
              {!n.active && <button type="button" disabled={busy} onClick={() => void post({ action: "save", id: n.id, title: n.title, kind: n.kind, city: n.city, body: n.body, active: true }, "Note is live.")} className="font-semibold text-emerald-700">Make live</button>}
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete “${n.title}”?`)) void post({ action: "delete", id: n.id }, "Deleted."); }} className="font-semibold text-red-700">Delete</button>
            </div>
          </li>)}
        </ul>
      </div>

      <div className="grid content-start gap-4">
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-[13px]">
          <h3 className="text-[15px] font-bold">{form.id ? "Edit note" : "Add a note"}</h3>
          <label className="grid gap-1 font-semibold">Title<input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Child seats" className={input} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 font-semibold">Type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={input}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="grid gap-1 font-semibold">City (optional)<input maxLength={60} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="bangkok" className={input} /></label>
          </div>
          <label className="grid gap-1 font-semibold">What Non should know<textarea required maxLength={4000} rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Child and baby seats: ฿300 each. Ask the age and weight. Add them on the booking page under Extras." className="rounded-lg border border-slate-200 p-3 font-normal" /></label>
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[#FE8B05]" />Live (Non uses it)</label>
          <div className="flex gap-2"><button disabled={busy} className="h-10 flex-1 rounded-full bg-[#FE8B05] font-bold text-white">{form.id ? "Save changes" : "Add note"}</button>{form.id && <button type="button" onClick={() => setForm(EMPTY)} className="h-10 rounded-full border border-slate-200 px-4 font-semibold">Cancel</button>}</div>
        </form>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px]">
          <h3 className="text-[15px] font-bold">Import from Obsidian / Markdown</h3>
          <p className="mt-1 text-slate-600">Each <code># heading</code> becomes one note. Optional lines right under a heading: <code>kind: rule</code>, <code>city: bangkok</code>.</p>
          <label className="mt-3 inline-flex h-10 cursor-pointer items-center rounded-full border border-slate-200 px-4 font-semibold">Choose .md files<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple disabled={busy} onChange={(e) => { void importFiles(e.target.files); e.target.value = ""; }} className="sr-only" /></label>
        </div>
      </div>
    </section>
  </section>;
}

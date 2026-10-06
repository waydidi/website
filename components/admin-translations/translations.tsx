"use client";

import { useCallback, useEffect, useState } from "react";
import { SITE_LANGS } from "@/lib/site-languages";
import { PageTranslator } from "./page-translator";

type Row = { hash: string; source: string; text: string; status: string; path: string | null; updated_at: string; updated_by: string | null };
type Data = { rows: Row[]; counts: { lang: string; total: number; reviewed: number }[]; usage: { strings: number; usd: number } | null; configured: boolean };
const LANGS = SITE_LANGS.filter((l) => l.code !== "en");
const input = "h-10 rounded-lg border border-slate-200 px-3 font-normal";

// Every AI-translated line of the website, per language: check, correct, or ask for a new translation.
export function SiteTranslations() {
  const [lang, setLang] = useState("th");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [add, setAdd] = useState({ source: "", text: "" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/translations?${new URLSearchParams({ lang, q, status, page: String(page) })}`, { cache: "no-store" });
    const out = await res.json().catch(() => ({})) as Data & { error?: string };
    if (!res.ok) { setError(out.error ?? "Couldn't load translations."); return; }
    setError(""); setData(out);
  }, [lang, q, status, page]);
  useEffect(() => { const t = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(t); }, [load]);

  async function post(body: Record<string, unknown>, done: string) {
    setMsg(""); setError("");
    const res = await fetch("/api/admin/translations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, ...body }) });
    const out = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) { setError(out.error ?? "That didn't work."); return false; }
    setMsg(done); await load(); return true;
  }

  const count = (code: string) => data?.counts.find((c) => c.lang === code);
  return <section className="grid gap-4 text-[14px]">
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto]">
      <p className="text-slate-600">Every page is translated by AI the first time someone views it in a language, then saved and reused. Correct any line here: corrected lines are marked <b>Checked</b> and never changed by the AI. Prices, refunds and legal pages show a note that the English is the official text.</p>
      <p className="text-right text-slate-500">{data?.configured === false ? <span className="font-semibold text-red-700">Off: add ANTHROPIC_API_KEY in Cloudflare</span> : <>This month: {data?.usage?.strings ?? 0} lines · ${(data?.usage?.usd ?? 0).toFixed(2)}</>}</p>
    </div>
    <PageTranslator onDone={() => void load()} />
    <nav className="flex flex-wrap gap-2" aria-label="Languages">
      {LANGS.map((l) => { const c = count(l.code); return <button key={l.code} type="button" onClick={() => { setLang(l.code); setPage(0); }} aria-pressed={lang === l.code}
        className={`rounded-full px-3 py-1.5 font-semibold ${lang === l.code ? "bg-[#FFF0DF] text-[#C96100]" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l.label}{c ? <span className="ml-1 font-normal text-slate-500">{c.reviewed}/{c.total}</span> : null}</button>; })}
    </nav>
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-[13px]">
      <label className="grid flex-1 gap-1 font-semibold">Search<input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="English or translated text" className={input} /></label>
      <label className="grid gap-1 font-semibold">Show<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className={input}><option value="">All</option><option value="machine">Not checked</option><option value="reviewed">Checked</option></select></label>
    </div>
    {(msg || error) && <p role={error ? "alert" : "status"} className={`rounded-xl p-3 ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{error || msg}</p>}
    <ul className="grid gap-2">
      {data && !data.rows.length && <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">Nothing here yet. Lines appear after someone views a page in this language.</li>}
      {data?.rows.map((r) => { const v = edits[r.hash] ?? r.text; return <li key={r.hash} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
        <div><p className="text-[12px] font-semibold text-slate-500">English{r.path ? ` · ${r.path}` : ""}</p><p className="mt-1 whitespace-pre-wrap">{r.source}</p></div>
        <div className="grid gap-2">
          <textarea value={v} rows={Math.min(6, Math.ceil(v.length / 60) + 1)} onChange={(e) => setEdits({ ...edits, [r.hash]: e.target.value })} className="rounded-lg border border-slate-200 p-2" aria-label="Translation" />
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${r.status === "reviewed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{r.status === "reviewed" ? `Checked${r.updated_by ? ` by ${r.updated_by}` : ""}` : "AI, not checked"}</span>
            {v !== r.text && <button type="button" onClick={() => void post({ action: "save", hash: r.hash, text: v }, "Saved.").then((ok) => ok && setEdits((e) => { const n = { ...e }; delete n[r.hash]; return n; }))} className="font-semibold text-[#C96100]">Save</button>}
            {r.status !== "reviewed" && v === r.text && <button type="button" onClick={() => void post({ action: "approve", hash: r.hash }, "Marked checked.")} className="font-semibold text-emerald-700">Looks right</button>}
            <button type="button" onClick={() => { if (window.confirm("Translate this line again with AI next time it's viewed?")) void post({ action: "retranslate", hash: r.hash }, "It will be translated again."); }} className="font-semibold text-slate-500">Translate again</button>
          </div>
        </div>
      </li>; })}
    </ul>
    <div className="flex gap-2">
      <button type="button" disabled={!page} onClick={() => setPage((p) => p - 1)} className="h-10 rounded-full border border-slate-200 px-4 font-semibold disabled:opacity-40">Previous</button>
      <button type="button" disabled={(data?.rows.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)} className="h-10 rounded-full border border-slate-200 px-4 font-semibold disabled:opacity-40">Next</button>
    </div>
    <form onSubmit={(e) => { e.preventDefault(); void post({ action: "save", source: add.source, text: add.text }, "Saved.").then((ok) => ok && setAdd({ source: "", text: "" })); }} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-[15px] font-bold">Set a translation yourself</h2>
      <p className="text-slate-500">Paste the exact English text from the page and how it should read in {LANGS.find((l) => l.code === lang)?.english}.</p>
      <div className="grid gap-2 lg:grid-cols-2">
        <textarea required value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })} placeholder="English" rows={2} className="rounded-lg border border-slate-200 p-2" />
        <textarea required value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} placeholder="Translation" rows={2} className="rounded-lg border border-slate-200 p-2" />
      </div>
      <button className="h-10 w-fit rounded-full bg-[#FE8B05] px-5 font-bold text-white">Save translation</button>
    </form>
  </section>;
}

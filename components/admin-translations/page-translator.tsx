"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SITE_LANGS, TX_MODEL, estimateCost, pageTexts, untranslatedPath, type SiteLang } from "@/lib/site-languages";

// Admin → Translations: pick pages (or a whole section), see how many texts are new in each
// language and the estimated cost, then translate them ahead of time.

const LANGS = SITE_LANGS.filter((l) => l.code !== "en");
type Row = { lang: SiteLang; total: number; missing: string[]; usd: number };
const usd = (n: number) => (n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`);
const parent = (p: string) => (p === "/" ? null : p.split("/").slice(0, -1).join("/") || "/");

export function PageTranslator({ onDone }: { onDone: () => void }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [langs, setLangs] = useState<Set<SiteLang>>(new Set(LANGS.map((l) => l.code)));
  const [texts, setTexts] = useState<Map<string, string[]> | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    void fetch("/sitemap.xml").then((r) => r.text()).then((xml) => {
      const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => { try { return new URL(m[1]).pathname.replace(/\/$/, "") || "/"; } catch { return ""; } })
        .filter((p) => p && !untranslatedPath(p));
      setPages([...new Set(paths)].sort());
    }).catch(() => setPages([]));
  }, []);

  // Pages under each section, e.g. /destinations → /destinations/pattaya, /destinations/hua-hin…
  const children = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of pages ?? []) for (let a = parent(p); a; a = parent(a)) { if (!m.has(a)) m.set(a, []); m.get(a)!.push(p); }
    return m;
  }, [pages]);
  const shown = (pages ?? []).filter((p) => !q || p.includes(q.toLowerCase()));
  const toggle = (paths: string[], on: boolean) => { const n = new Set(picked); for (const p of paths) { if (on) n.add(p); else n.delete(p); } setPicked(n); setRows(null); };

  async function scan() {
    setError(""); setRows(null); setBusy("Reading pages…");
    try {
      const byPage = new Map<string, string[]>();
      const list = [...picked];
      for (let i = 0; i < list.length; i += 4) {
        await Promise.all(list.slice(i, i + 4).map(async (p) => {
          const html = await fetch(p, { headers: { "x-waydidi-scan": "1" } }).then((r) => (r.ok ? r.text() : ""));
          byPage.set(p, html ? pageTexts(new DOMParser().parseFromString(html, "text/html")) : []);
        }));
        setBusy(`Reading pages… ${Math.min(i + 4, list.length)}/${list.length}`);
      }
      setTexts(byPage);
      const all = [...new Set([...byPage.values()].flat())];
      const out: Row[] = [];
      for (const lang of LANGS.filter((l) => langs.has(l.code))) {
        setBusy(`Checking ${lang.english}…`);
        const res = await fetch("/api/admin/translations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "missing", lang: lang.code, texts: all }) });
        const data = await res.json() as { total?: number; missing?: string[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't check translations.");
        out.push({ lang: lang.code, total: data.total ?? 0, missing: data.missing ?? [], usd: estimateCost(data.missing ?? [], lang.code) });
      }
      setRows(out);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(""); }
  }

  async function translate() {
    if (!rows || !texts) return;
    setError("");
    const pathOf = (t: string) => [...texts.entries()].find(([, v]) => v.includes(t))?.[0] ?? null;
    try {
      for (const r of rows) {
        for (let i = 0; i < r.missing.length; i += 60) {
          const part = r.missing.slice(i, i + 60);
          setBusy(`Translating ${SITE_LANGS.find((l) => l.code === r.lang)?.english}… ${Math.min(i + 60, r.missing.length)}/${r.missing.length}`);
          const res = await fetch("/api/admin/translations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "translate", lang: r.lang, texts: part, path: pathOf(part[0]) }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? "Translation stopped.");
        }
      }
      setBusy(""); setRows(null); onDone();
      await scan();
    } catch (e) { setError(e instanceof Error ? e.message : "Translation stopped."); setBusy(""); }
  }

  const total = rows?.reduce((n, r) => n + r.usd, 0) ?? 0;
  const newCount = rows?.reduce((n, r) => n + r.missing.length, 0) ?? 0;
  return <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-[14px]">
    <div><h2 className="text-[16px] font-bold">Translate pages</h2>
      <p className="text-slate-600">Choose pages, or a whole section with every page under it. You&apos;ll see how many texts are new in each language and the estimated cost with {TX_MODEL.name} before anything is translated. Translated text is saved and reused, so you only pay once.</p></div>

    <div className="flex flex-wrap gap-1.5">
      {LANGS.map((l) => <button key={l.code} type="button" aria-pressed={langs.has(l.code)} onClick={() => { const n = new Set(langs); if (n.has(l.code)) n.delete(l.code); else n.add(l.code); setLangs(n); setRows(null); }}
        className={`rounded-full px-3 py-1 text-[13px] font-semibold ${langs.has(l.code) ? "bg-brand-tint text-brand-darker" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`}>{l.label}</button>)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter pages, e.g. destinations" className="h-9 flex-1 rounded-lg border border-slate-200 px-3" />
      <button type="button" onClick={() => toggle(shown, true)} className="text-[13px] font-semibold text-brand-darker">Select shown</button>
      <button type="button" onClick={() => toggle([...picked], false)} className="text-[13px] font-semibold text-slate-500">Clear</button>
    </div>

    <ul className="max-h-72 overflow-y-auto rounded-xl border border-slate-100">
      {pages === null && <li className="p-4 text-slate-500"><LoaderCircle size={15} className="inline animate-spin" /> Loading pages…</li>}
      {shown.map((p) => { const kids = children.get(p) ?? []; const depth = p === "/" ? 0 : p.split("/").length - 2;
        return <li key={p} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-3 py-2 last:border-0" style={{ paddingLeft: 12 + depth * 18 }}>
          <label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={picked.has(p)} onChange={(e) => toggle([p], e.target.checked)} className="size-4 accent-brand" /><span className="truncate font-mono text-[13px]">{p}</span></label>
          {kids.length > 0 && <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600"><input type="checkbox" checked={[p, ...kids].every((k) => picked.has(k))} onChange={(e) => toggle([p, ...kids], e.target.checked)} className="size-4 accent-brand" />Whole section ({kids.length + 1} pages)</label>}
        </li>; })}
    </ul>

    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={!picked.size || !langs.size || Boolean(busy)} onClick={() => void scan()} className="h-10 rounded-full border border-slate-200 px-4 font-semibold disabled:opacity-50">Count texts and cost ({picked.size} page{picked.size === 1 ? "" : "s"})</button>
      {busy && <span className="text-slate-600"><LoaderCircle size={15} className="mr-1 inline animate-spin" />{busy}</span>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}

    {rows && <div className="grid gap-2">
      <table className="w-full text-left text-[13px]"><thead className="text-slate-500"><tr><th className="py-1">Language</th><th>Texts on pages</th><th>New to translate</th><th>Estimated cost</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.lang} className="border-t border-slate-100"><td className="py-1.5">{SITE_LANGS.find((l) => l.code === r.lang)?.label}</td><td>{r.total}</td><td>{r.missing.length || "All done"}</td><td>{r.missing.length ? usd(r.usd) : "—"}</td></tr>)}</tbody>
        <tfoot><tr className="border-t border-slate-200 font-bold"><td className="py-1.5">Total</td><td /><td>{newCount}</td><td>{usd(total)}</td></tr></tfoot></table>
      <p className="text-[12.5px] text-slate-500">An estimate for {TX_MODEL.name} (US${TX_MODEL.inUsd} input / US${TX_MODEL.outUsd} output per million tokens). The real cost appears above under “This month”.</p>
      <button type="button" disabled={!newCount || Boolean(busy)} onClick={() => { if (window.confirm(`Translate ${newCount} texts for about ${usd(total)}?`)) void translate(); }} className="h-10 w-fit rounded-full bg-brand px-5 font-bold text-white disabled:opacity-50">Translate {newCount} texts now</button>
    </div>}
  </section>;
}

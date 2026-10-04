"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Review = { id: string; rating: number; feedback: string | null; admin_name: string | null; consent_to_publish: number; publication_status: string; needs_attention: number; submitted_at: string; google_cta_clicked_at: string | null; conversation_id: string; public_id: string; customer_name: string | null; source_title: string | null; source_url: string | null };
type Data = {
  summary: { count: number; average: number | null; attention: number | null };
  distribution: { rating: number; n: number }[]; perAdmin: { admin: string; reviews: number; average: number }[]; reviews: Review[];
  funnel: { closed: number; prompted: number; rated: number; submitted: number; cta_shown: number; cta_clicked: number };
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "–");
const stars = (n: number) => <span className="inline-flex" aria-label={`${n} of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} aria-hidden="true" className={i <= n ? "fill-[#FE8B05] text-[#FE8B05]" : "text-slate-300"} />)}</span>;

// Waydidi's internal support ratings from the chat. Not Google reviews; Google clicks are only clicks.
export function SupportReviews() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState({ rating: "", admin: "", from: "", to: "", attention: false });
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (f.rating) p.set("rating", f.rating); if (f.admin) p.set("admin", f.admin); if (f.from) p.set("from", f.from); if (f.to) p.set("to", f.to); if (f.attention) p.set("attention", "1");
    const res = await fetch(`/api/admin/chat/reviews?${p}`, { cache: "no-store" });
    const out = await res.json().catch(() => ({})) as Data & { error?: string };
    if (!res.ok) { setError(out.error ?? "Reviews couldn't be loaded."); return; }
    setData(out); setError("");
  }, [f]);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);
  async function act(id: string, action: string) {
    const res = await fetch("/api/admin/chat/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work."); else void load();
  }

  if (error && !data) return <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const total = data.summary.count || 0, max = Math.max(1, ...data.distribution.map((d) => d.n));
  const fu = data.funnel;
  return <section className="grid gap-4">
    <h2 className="sr-only">Customer support reviews</h2>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-[13px] font-semibold text-slate-500">Support rating (Waydidi chat)</p>
        <p className="mt-1 text-[34px] font-bold">{data.summary.average ?? "–"} <span className="text-[#FE8B05]">★</span></p>
        <p className="text-[14px] text-slate-600">{total} {total === 1 ? "review" : "reviews"}{data.summary.attention ? ` · ${data.summary.attention} need attention` : ""}</p>
        <ul className="mt-3 grid gap-1.5">{[5, 4, 3, 2, 1].map((r) => { const n = data.distribution.find((d) => d.rating === r)?.n ?? 0; return <li key={r} className="flex items-center gap-2 text-[13px]"><span className="w-8 shrink-0">{r} ★</span><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#FE8B05]" style={{ width: `${(n / max) * 100}%` }} /></span><span className="w-8 text-right tabular-nums">{n}</span></li>; })}</ul>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px]">
        <p className="text-[13px] font-semibold text-slate-500">Feedback funnel</p>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5">
          <dt>Closed chats</dt><dd className="text-right font-semibold tabular-nums">{fu.closed}</dd>
          <dt>Rating prompt seen</dt><dd className="text-right font-semibold tabular-nums">{fu.prompted}</dd>
          <dt>Rating selected</dt><dd className="text-right font-semibold tabular-nums">{fu.rated}</dd>
          <dt>Feedback submitted</dt><dd className="text-right font-semibold tabular-nums">{fu.submitted} <span className="font-normal text-slate-500">({pct(fu.submitted, fu.closed)})</span></dd>
          <dt>Google link shown</dt><dd className="text-right font-semibold tabular-nums">{fu.cta_shown}</dd>
          <dt>Google link clicked</dt><dd className="text-right font-semibold tabular-nums">{fu.cta_clicked} <span className="font-normal text-slate-500">({pct(fu.cta_clicked, fu.cta_shown)})</span></dd>
        </dl>
        <p className="mt-2 text-[12px] text-slate-500">A click opens Google; it doesn&apos;t mean a Google review was posted.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px]">
        <p className="text-[13px] font-semibold text-slate-500">By admin (internal only)</p>
        <ul className="mt-2 grid gap-2">{data.perAdmin.length ? data.perAdmin.map((a) => <li key={a.admin} className="flex items-center justify-between gap-2"><button type="button" onClick={() => setF({ ...f, admin: f.admin === a.admin ? "" : a.admin })} className={`truncate text-left ${f.admin === a.admin ? "font-bold text-[#C96100]" : ""}`}>{a.admin}</button><span className="shrink-0 tabular-nums">{a.average} ★ · {a.reviews}</span></li>) : <li className="text-slate-500">No reviews yet.</li>}</ul>
      </div>
    </section>

    <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-[13px]">
      <label className="grid gap-1 font-semibold">Rating<select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} className="h-9 rounded-lg border border-slate-200 px-2 font-normal"><option value="">All</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}</select></label>
      <label className="grid gap-1 font-semibold">Admin<select value={f.admin} onChange={(e) => setF({ ...f, admin: e.target.value })} className="h-9 rounded-lg border border-slate-200 px-2 font-normal"><option value="">All</option>{data.perAdmin.map((a) => <option key={a.admin}>{a.admin}</option>)}</select></label>
      <label className="grid gap-1 font-semibold">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-9 rounded-lg border border-slate-200 px-2 font-normal" /></label>
      <label className="grid gap-1 font-semibold">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-9 rounded-lg border border-slate-200 px-2 font-normal" /></label>
      <label className="flex h-9 items-center gap-2 font-semibold"><input type="checkbox" checked={f.attention} onChange={(e) => setF({ ...f, attention: e.target.checked })} className="accent-[#FE8B05]" />Needs attention</label>
    </section>

    <ul className="grid gap-2">
      {!data.reviews.length && <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">No reviews match.</li>}
      {data.reviews.map((r) => <li key={r.id} className={`rounded-2xl border bg-white p-4 text-[14px] ${r.needs_attention ? "border-red-200" : "border-slate-200"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {stars(r.rating)}
          {r.needs_attention ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-700">Needs attention</span> : null}
          <span className="text-slate-600">{r.customer_name ?? "Guest"} · {r.admin_name ?? "Unassigned"}</span>
          <span className="ml-auto text-[12.5px] text-slate-500">{new Date(r.submitted_at).toLocaleString()}</span>
        </div>
        {r.feedback && <p className="mt-2 whitespace-pre-wrap break-words">{r.feedback}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-500">
          <Link href={`/admin/chat?id=${encodeURIComponent(r.conversation_id)}`} className="font-semibold text-[#C96100] underline">{r.public_id}</Link>
          {(r.source_title || r.source_url) && <span>From {r.source_title || r.source_url}</span>}
          {r.google_cta_clicked_at && <span>Opened Google review link</span>}
          <span>{r.consent_to_publish ? `May publish · ${r.publication_status}` : "Private (no consent)"}</span>
          {r.consent_to_publish ? <>{r.publication_status !== "approved" && <button type="button" onClick={() => void act(r.id, "approve")} className="font-semibold text-emerald-700">Approve</button>}{r.publication_status !== "rejected" && <button type="button" onClick={() => void act(r.id, "reject")} className="font-semibold text-slate-600">Reject</button>}</> : null}
          {r.needs_attention ? <button type="button" onClick={() => void act(r.id, "resolve")} className="font-semibold text-red-700">Mark handled</button> : null}
        </div>
      </li>)}
    </ul>
  </section>;
}

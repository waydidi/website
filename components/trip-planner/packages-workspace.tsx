"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, areaCls, btnPrimary, btnQuiet, Field, inputCls, selectCls, toList, uploadImage } from "@/components/trip-planner/ui";
import { VEHICLES } from "@/lib/vehicles";

type Kind = "half_day" | "full_day" | "evening" | "multi_day";
const KINDS: [Kind, string][] = [["half_day", "Half day"], ["full_day", "Full day"], ["evening", "Evening"], ["multi_day", "Multi-day"]];
type Pkg = { id?: string; slug: string; city: string; templateId: string; name: string; kind: Kind; summary: string | null; highlights: string[]; included: string[]; excluded: string[];
  startTimes: string[]; coverImage: string | null; prices: Record<string, number>; minNoticeHours: number; published: boolean; sortOrder: number };
type Template = { id: string; name: string | null; hours: number; startTime: string | null; stops: number; feesTotal: number; suggested: Record<string, number> };
type Data = { packages: Pkg[]; templates: Template[]; cities: { slug: string; name: string }[] };

const blank = (city: string): Pkg => ({ slug: "", city, templateId: "", name: "", kind: "half_day", summary: null, highlights: [], included: ["Private car and driver", "Hotel pickup and drop-off", "Fuel, tolls and parking"],
  excluded: ["Entry fees", "Meals and drinks"], startTimes: ["08:00"], coverImage: null, prices: {}, minNoticeHours: 24, published: false, sortOrder: 0 });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

export function PackagesWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<Pkg | null>(null);
  const [error, setError] = useState("");
  const load = () => api<Data>("/api/admin/packages", "GET").then(setData).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (!data) return <p className="p-6 text-slate-600">{error || "Loading…"}</p>;
  if (edit) return <Editor initial={edit} data={data} onClose={(saved) => { setEdit(null); if (saved) load(); }} />;
  const cityName = (s: string) => data.cities.find((c) => c.slug === s)?.name ?? s;
  return <section className="grid gap-4 p-4 sm:p-6">
    <h1 className="sr-only">Trip packages</h1>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-[14px] text-slate-600">Your saved trips. Tick <b>Show on website</b> to sell one on its city page; the others are staff-only shortcuts. Use <b>Quick quote</b> to turn any of them into a trip for one customer.</p>
      <div className="flex flex-wrap gap-2">
        <Link className={btnQuiet} href="/admin/trips/new?template=1">New trip plan</Link>
        <button className={btnPrimary} onClick={() => setEdit(blank(data.cities[0]?.slug ?? "bangkok"))} disabled={!data.templates.length}>New package</button>
      </div>
    </div>
    {!data.templates.length && <p className="rounded-xl bg-amber-50 p-3 text-[14px] text-amber-900">Make a trip plan first (its stops and timing): <b>New trip plan</b>, or open a Smart trip and save it as a plan.</p>}
    {!data.packages.length ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">No packages yet.</p> :
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.packages.map((p) => {
        const from = Object.values(p.prices).filter((n) => n > 0);
        return <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-[#FF8A05]"><button onClick={() => setEdit(p)} className="block w-full text-left">
          <div className="aspect-[16/9] bg-slate-100">{p.coverImage && <img src={p.coverImage} alt="" className="h-full w-full object-cover" />}</div>
          <div className="grid gap-1 p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold"><span className={p.published ? "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700" : "rounded-full bg-slate-100 px-2 py-0.5 text-slate-600"}>{p.published ? "On website" : "Staff only"}</span><span className="text-slate-500">{cityName(p.city)} · {KINDS.find((k) => k[0] === p.kind)?.[1]}</span></div>
            <p className="text-[16px] font-bold">{p.name}</p>
            <p className="text-[13px] text-slate-600">{from.length ? `From ${thb(Math.min(...from))}` : "No price yet"} · {p.startTimes.join(", ")}</p>
          </div>
        </button>
          <div className="flex gap-4 border-t border-slate-100 px-4 py-2.5 text-[13px] font-semibold"><a href={`/admin/trips?quote=${encodeURIComponent(p.templateId)}`} className="text-[#C96100] hover:underline">Quick quote</a><a href={`/admin/trips/${encodeURIComponent(p.templateId)}`} className="text-slate-600 hover:underline">Edit stops</a></div>
        </div>;
      })}</section>}
    {/* Trip plans not yet made into a package (the old Quick quote templates) */}
    {(() => { const loose = data.templates.filter((t) => !data.packages.some((p) => p.templateId === t.id)); if (!loose.length) return null; return <section className="grid gap-2">
      <h2 className="mt-2 text-[15px] font-bold">Trip plans not yet packaged <span className="font-normal text-slate-500">(staff only)</span></h2>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{loose.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[14px]">
        <span className="min-w-0 flex-1"><b>{t.name || "Untitled plan"}</b> <span className="text-slate-500">· {t.stops} stops · {t.hours} hr</span></span>
        <a href={`/admin/trips?quote=${encodeURIComponent(t.id)}`} className="font-semibold text-[#C96100] hover:underline">Quick quote</a>
        <a href={`/admin/trips/${encodeURIComponent(t.id)}`} className="font-semibold text-slate-600 hover:underline">Edit stops</a>
        <button type="button" onClick={() => setEdit({ ...blank(data.cities[0]?.slug ?? "bangkok"), templateId: t.id, name: t.name ?? "", startTimes: t.startTime ? [t.startTime] : ["08:00"] })} className="font-semibold text-emerald-700 hover:underline">Make a package</button>
      </li>)}</ul>
    </section>; })()}
  </section>;
}

function Editor({ initial, data, onClose }: { initial: Pkg; data: Data; onClose: (saved: boolean) => void }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lists, setLists] = useState({ highlights: initial.highlights.join("\n"), included: initial.included.join("\n"), excluded: initial.excluded.join("\n"), times: initial.startTimes.join(", ") });
  const set = <K extends keyof Pkg>(k: K, v: Pkg[K]) => setP((x) => ({ ...x, [k]: v }));
  const tpl = data.templates.find((t) => t.id === p.templateId);

  const save = async () => {
    setBusy(true); setError("");
    try {
      await api("/api/admin/packages", "POST", { ...p, slug: p.slug || slugify(p.name), highlights: toList(lists.highlights), included: toList(lists.included), excluded: toList(lists.excluded), startTimes: toList(lists.times),
        prices: Object.fromEntries(Object.entries(p.prices).filter(([, n]) => n > 0)) });
      onClose(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const upload = async (f: File | undefined) => { if (!f) return; setBusy(true); try { set("coverImage", await uploadImage(f)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };

  return <section className="grid max-w-4xl gap-5 p-4 sm:p-6">
    <h1 className="sr-only">Edit package</h1>
    <div className="flex items-center justify-between gap-3"><button className={btnQuiet} onClick={() => onClose(false)}>Back</button>
      {p.id && p.published && <a className={btnQuiet} href={`/trips/${p.slug}`} target="_blank" rel="noreferrer">View on website</a>}</div>

    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Trip plan" hint={tpl ? `${tpl.stops} stops · ${tpl.hours} hours · entry fees THB ${tpl.feesTotal} per group` : "The stops and timing come from this plan."} className="sm:col-span-2">
        <select className={selectCls} value={p.templateId} onChange={(e) => { const t = data.templates.find((x) => x.id === e.target.value); setP((x) => ({ ...x, templateId: e.target.value, name: x.name || t?.name || "", startTimes: x.startTimes })); if (t?.startTime && !p.id) setLists((l) => ({ ...l, times: t.startTime! })); }}>
          <option value="">Choose a trip plan…</option>{data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Name"><input className={inputCls} value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="Bangkok temples and rooftop half day" /></Field>
      <Field label="Web address" hint={`/trips/${p.slug || slugify(p.name) || "…"}`}><input className={inputCls} value={p.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder={slugify(p.name)} /></Field>
      <Field label="City page"><select className={selectCls} value={p.city} onChange={(e) => set("city", e.target.value)}>{data.cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
      <Field label="Length"><select className={selectCls} value={p.kind} onChange={(e) => set("kind", e.target.value as Kind)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Start times" hint="Comma separated, like 08:00, 13:00"><input className={inputCls} value={lists.times} onChange={(e) => setLists({ ...lists, times: e.target.value })} /></Field>
      <Field label="Book at least (hours ahead)"><input type="number" className={inputCls} value={p.minNoticeHours} onChange={(e) => set("minNoticeHours", Number(e.target.value) || 0)} /></Field>
      <Field label="Summary" className="sm:col-span-2"><textarea className={areaCls} maxLength={400} value={p.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} /></Field>
    </section>

    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-[15px] font-bold">Price per car</h2>
      <p className="text-[13px] text-slate-600">The customer pays this price plus the entry fees. Leave a car empty to not offer it.</p>
      <section className="grid gap-3 sm:grid-cols-2">{Object.entries(VEHICLES).map(([id, v]) => <Field key={id} label={`${v.name} (${v.passengers} seats)`} hint={tpl?.suggested[id] ? `Suggested THB ${tpl.suggested[id].toLocaleString("en-US")}` : undefined}>
        <input type="number" className={inputCls} value={p.prices[id] ?? ""} onChange={(e) => set("prices", { ...p.prices, [id]: Number(e.target.value) || 0 })} />
      </Field>)}</section>
    </section>

    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <Field label="Highlights" hint="One per line"><textarea className={`${areaCls} min-h-32`} value={lists.highlights} onChange={(e) => setLists({ ...lists, highlights: e.target.value })} /></Field>
      <Field label="Included" hint="One per line"><textarea className={`${areaCls} min-h-32`} value={lists.included} onChange={(e) => setLists({ ...lists, included: e.target.value })} /></Field>
      <Field label="Not included" hint="One per line"><textarea className={`${areaCls} min-h-32`} value={lists.excluded} onChange={(e) => setLists({ ...lists, excluded: e.target.value })} /></Field>
    </section>

    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[200px_1fr] sm:items-center">
      <div className="aspect-[16/9] overflow-hidden rounded-xl bg-slate-100">{p.coverImage && <img src={p.coverImage} alt="" className="h-full w-full object-cover" />}</div>
      <div className="grid gap-2"><Field label="Cover photo"><input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></Field>
        {p.coverImage && <button className="justify-self-start text-[13px] text-red-600" onClick={() => set("coverImage", null)}>Remove photo</button>}</div>
    </section>

    <section className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={p.published} onChange={(e) => set("published", e.target.checked)} /> Show on website (customers can book it on the city page). Untick to keep it staff-only.</label>
      <label className="flex items-center gap-2 text-[14px]">Order <input type="number" className={`${inputCls} w-20`} value={p.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} /></label>
      <button className={btnPrimary} onClick={save} disabled={busy || !p.templateId || !p.name}>{busy ? "Saving…" : "Save package"}</button>
      {error && <p className="text-[14px] text-red-600">{error}</p>}
    </section>
  </section>;
}

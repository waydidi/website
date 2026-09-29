"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HOURLY_AREAS, type HourlyArea } from "@/lib/hourly-areas-data";
import type { AreaRate, AreaSetting } from "@/lib/hourly-area-pricing";
import type { PricingVehicleId } from "@/lib/pricing";

const CARS: [PricingVehicleId, string][] = [["economy_sedan", "Economy sedan"], ["comfort_bmw", "Comfort BMW"], ["comfort_suv", "Comfort SUV"], ["premium_minivan", "Premium Minivan"]];
const COLS: [keyof AreaRate, string][] = [["hourlyRate", "Per hour (1–3 h)"], ["p4", "4 hours"], ["p5", "5 hours"], ["p6", "6 hours"], ["p8", "7–8 hours"], ["p10", "9–10 hours"]];

// Small outline of a city's border, drawn from its lat/lng rings.
function BorderPreview({ area }: { area: HourlyArea }) {
  const pts = area.polygons.flat();
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const w = (maxLng - minLng) * k, h = maxLat - minLat, s = 180 / Math.max(w, h);
  const path = area.polygons.map((ring) => ring.map(([lat, lng], i) => `${i ? "L" : "M"}${((lng - minLng) * k * s + 10).toFixed(1)},${((maxLat - lat) * s + 10).toFixed(1)}`).join("") + "Z").join("");
  return <svg viewBox={`0 0 ${w * s + 20} ${h * s + 20}`} className="h-40 w-full" role="img" aria-label={`${area.name} service area`}>
    <path d={path} fill="#FF8A05" fillOpacity={0.14} stroke="#FF8A05" strokeOpacity={0.7} strokeWidth={2} strokeLinejoin="round" />
  </svg>;
}

// Hourly pricing: one card per city with its border, on/off switch and car prices.
export default function HourlyWorkspace() {
  const [areas, setAreas] = useState<AreaSetting[] | null>(null);
  const [slug, setSlug] = useState(HOURLY_AREAS[0].slug);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { fetch("/api/admin/hourly-areas", { cache: "no-store" }).then((r) => r.json()).then((o: { areas: AreaSetting[] }) => setAreas(o.areas)).catch(() => setAreas([])); }, []);
  const current = areas?.find((a) => a.slug === slug);
  const geo = useMemo(() => HOURLY_AREAS.find((a) => a.slug === slug)!, [slug]);
  const edit = (fn: (a: AreaSetting) => AreaSetting) => { setNote(""); setAreas((all) => all?.map((a) => a.slug === slug ? fn(structuredClone(a)) : a) ?? null); };

  async function save() {
    if (!current) return;
    setBusy(true); setNote("");
    const res = await fetch("/api/admin/hourly-areas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setBusy(false); setNote(res?.ok ? "Saved" : out?.error ?? "Could not save.");
  }

  const input = "h-10 w-full min-w-[84px] rounded-lg border border-slate-200 bg-white px-2.5 text-right text-[14px] tabular-nums outline-none focus:border-[#FF8A05]";
  return <div className="px-4 pb-10 pt-4 sm:px-8">
    <div className="grid max-w-[1200px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Cities" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {(areas ?? HOURLY_AREAS.map((a, i) => ({ slug: a.slug, active: true, sortOrder: i }))).map((a) => {
          const name = HOURLY_AREAS.find((h) => h.slug === a.slug)?.name;
          return <button key={a.slug} type="button" onClick={() => { setSlug(a.slug); setNote(""); }} className={`flex shrink-0 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-[14px] font-semibold ${a.slug === slug ? "border-[#FF8A05] bg-[#FFF0DF] text-[#C96100]" : "border-slate-200 bg-white text-slate-700"}`}>
            {name}<span className={`size-2 rounded-full ${a.active ? "bg-[#06C755]" : "bg-slate-300"}`} aria-label={a.active ? "Offered" : "Off"} />
          </button>;
        })}
      </nav>
      {!areas ? <p className="flex items-center gap-2 text-slate-500"><LoaderCircle size={16} className="animate-spin" />Loading…</p> : !current ? <p className="text-slate-500">Could not load hourly areas.</p> :
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-[20px] font-bold">{geo.name}</h2><p className="text-[13px] text-slate-500">{geo.coverage}</p></div>
          <label className="flex items-center gap-3 text-[14px] font-medium">Offer by the hour
            <button type="button" role="switch" aria-checked={current.active} onClick={() => edit((a) => ({ ...a, active: !a.active }))} className={`relative h-7 w-12 rounded-full transition-colors ${current.active ? "bg-[#06C755]" : "bg-[#E53935]"}`}><span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${current.active ? "left-[22px]" : "left-0.5"}`} /></button>
          </label>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3"><BorderPreview area={geo} /><p className="text-center text-[11px] text-slate-400">Border shown to customers · Boundaries: geoBoundaries</p></div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="text-left text-slate-500"><th className="py-2 pr-3 font-medium">Car</th>{COLS.map(([, l]) => <th key={l} className="px-1.5 py-2 text-right font-medium">{l}</th>)}<th className="py-2 pl-3 text-center font-medium">On</th></tr></thead>
            <tbody>{CARS.map(([id, label]) => { const r = current.rates[id]; return <tr key={id} className="border-t border-slate-100">
              <td className="py-2 pr-3 font-medium">{label}</td>
              {COLS.map(([k]) => <td key={k} className="px-1.5 py-2"><input type="number" min={0} inputMode="numeric" aria-label={`${label} ${k}`} className={input} value={r[k] as number} onChange={(e) => edit((a) => { (a.rates[id] as Record<string, unknown>)[k] = Math.max(0, Math.round(Number(e.target.value) || 0)); return a; })} /></td>)}
              <td className="py-2 pl-3 text-center"><input type="checkbox" checked={r.active} onChange={(e) => edit((a) => { a.rates[id].active = e.target.checked; return a; })} className="size-4 accent-[#FF8A05]" aria-label={`Offer ${label}`} /></td>
            </tr>; })}</tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-500">Prices in THB. Under 4 hours the customer pays the hourly rate × hours; from 4 hours the package price applies. Pickups or drop-offs outside the border use the same prices.</p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}Save {geo.name}</button>
          {note && <span className={`text-[14px] font-medium ${note === "Saved" ? "text-emerald-700" : "text-red-600"}`}>{note}</span>}
        </div>
      </section>}
    </div>
  </div>;
}

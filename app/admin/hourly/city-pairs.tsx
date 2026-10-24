"use client";

import { useEffect, useState } from "react";
import type { CityPairSetting } from "@/lib/hourly-city-pricing";
import { HOURLY_VEHICLES, hourlyOvertime } from "@/lib/hourly-policy";

const NAMES = { economy_sedan: "Sedan", comfort_suv: "SUV", premium_minivan: "Minivan" };
const EXAMPLES = [6, 10] as const;
export default function HourlyCityPairs() {
  const [pairs, setPairs] = useState<CityPairSetting[]>([]);
  const [selected, setSelected] = useState("bangkok-pattaya");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [extraMinutes, setExtraMinutes] = useState(16);
  useEffect(() => {
    fetch("/api/admin/hourly-city-pairs", { cache: "no-store" }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Could not load rates."); setPairs(data.pairs); }).catch((e) => setNote(e.message));
  }, []);
  const current = pairs.find((p) => p.id === selected);
  function edit(update: (p: CityPairSetting) => CityPairSetting) {
    setNote(""); setPairs((all) => all.map((p) => p.id === selected ? update(structuredClone(p)) : p));
  }
  async function save() {
    if (!current) return;
    setBusy(true); setNote("");
    try {
      const response = await fetch("/api/admin/hourly-city-pairs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) });
      const data = await response.json();
      setNote(response.ok ? "Saved" : data.error ?? "Could not save rates.");
    } catch { setNote("Could not save rates. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="max-w-[1200px] rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-xl font-bold">Approved city pairs</h2>
    <p className="mt-1 text-sm text-slate-600">City-to-city costs hours (at least 6) × the hourly rate of the pair’s first city, the same in both directions. Change the rate under Local hourly prices. Routes over 100 km are priced as transfers.</p>
    <label className="mt-4 block text-sm font-medium">City pair
      <select value={selected} disabled={busy} onChange={(e) => { setSelected(e.target.value); setNote(""); }} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3">
        {pairs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    {current && <>
      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={current.active} disabled={busy} onChange={(e) => edit((p) => ({ ...p, active: e.target.checked }))} />Offer instant booking</label>
        <label>Maximum direct driving time (minutes)<input type="number" min={30} max={600} value={current.maxDrivingMinutes} disabled={busy} onChange={(e) => edit((p) => ({ ...p, maxDrivingMinutes: Number(e.target.value) }))} className="ml-2 h-10 w-24 rounded-lg border px-2 text-right" /></label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Longer routes and unsupported pairs go to operations. Kilometres are unlimited within the approved itinerary; tolls are included.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-sm">
        <thead><tr className="text-left text-slate-500"><th className="py-2">Vehicle</th><th className="px-2 text-right">Per hour</th>{EXAMPLES.map((h) => <th key={h} className="px-2 text-right">{h} hours</th>)}<th className="text-center">On</th></tr></thead>
        <tbody>{HOURLY_VEHICLES.map((v) => <tr key={v} className="border-t border-slate-100">
          <th className="py-3 text-left font-medium">{NAMES[v]}</th>
          <td className="px-2 text-right tabular-nums">฿{current.rates[v].hourlyRate.toLocaleString("en-US")}</td>
          {EXAMPLES.map((h) => <td key={h} className="px-2 text-right tabular-nums text-slate-500">฿{(h * current.rates[v].hourlyRate).toLocaleString("en-US")}</td>)}
          <td className="text-center"><input type="checkbox" disabled={busy} checked={current.rates[v].active} aria-label={`Offer ${NAMES[v]}`} onChange={(e) => edit((p) => { p.rates[v].active = e.target.checked; return p; })} /></td>
        </tr>)}</tbody>
      </table></div>
      <div className="mt-4 flex items-center gap-3"><button disabled={busy} onClick={save} className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save city pair"}</button></div>
      <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm">
        <label>Overtime calculator · extra minutes <input type="number" min={0} max={1440} value={extraMinutes} onChange={(e) => setExtraMinutes(Math.max(0, Number(e.target.value) || 0))} className="ml-2 h-9 w-20 rounded border bg-white px-2" /></label>
        <p className="mt-2">{HOURLY_VEHICLES.map((v) => `${NAMES[v]}: ฿${hourlyOvertime(extraMinutes, current.rates[v].hourlyRate).total}`).join(" · ")}</p>
        <p className="mt-1 text-xs text-slate-500">First 15 minutes free; after that, each started hour is charged. This is a calculation preview, not a payment receipt.</p>
      </div>
    </>}
    {note && <p role="status" className={`mt-3 text-sm ${note === "Saved" ? "text-emerald-700" : "text-red-600"}`}>{note}</p>}
  </section>;
}

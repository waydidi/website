"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { listRules, Box } from "@/lib/route-inclusions-admin";

type Row = Awaited<ReturnType<typeof listRules>>[number];
type Form = { id?: string; name: string; origin: Record<keyof Box, string>; destination: Record<keyof Box, string>; bidirectional: boolean; includesTolls: boolean; includesFerry: boolean; active: boolean; priority: string };

const BANGKOK = { south: "13.45", north: "14.05", west: "100.25", east: "100.97" };
const EMPTY: Form = { name: "", origin: BANGKOK, destination: { south: "", north: "", west: "", east: "" }, bidirectional: true, includesTolls: true, includesFerry: false, active: true, priority: "50" };
const toStrings = (b: Box | null) => (b ? { south: String(b.south), north: String(b.north), west: String(b.west), east: String(b.east) } : { south: "", north: "", west: "", east: "" });
const boxText = (b: Box | null) => (b ? `${b.south}–${b.north}°N, ${b.west}–${b.east}°E` : "—");

export function RouteInclusionsAdmin({ rules }: { rules: Row[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(body: unknown) {
    setBusy(true); setError("");
    const response = await fetch("/api/admin/route-inclusions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Could not save."); return false; }
    router.refresh();
    return true;
  }

  async function save() {
    if (!form) return;
    const num = (b: Form["origin"]) => ({ south: Number(b.south), north: Number(b.north), west: Number(b.west), east: Number(b.east) });
    if (await post({ action: "save", id: form.id, name: form.name, origin: num(form.origin), destination: num(form.destination), bidirectional: form.bidirectional, includesTolls: form.includesTolls, includesFerry: form.includesFerry, active: form.active, priority: Number(form.priority) })) setForm(null);
  }

  const input = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#FF8A05]";
  const boxFields = (key: "origin" | "destination", label: string) => form && <fieldset className="rounded-2xl border border-slate-200 p-4">
    <legend className="px-1 text-sm font-bold">{label}</legend>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(["south", "north", "west", "east"] as const).map((side) => <label key={side} className="text-xs font-semibold capitalize text-slate-600">{side}{side === "south" || side === "north" ? " (lat)" : " (lng)"}
        <input inputMode="decimal" value={form[key][side]} onChange={(e) => setForm({ ...form, [key]: { ...form[key], [side]: e.target.value } })} className={input} />
      </label>)}
    </div>
  </fieldset>;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black">Route inclusions</h1>
        <p className="mt-1 text-slate-600">What each route&apos;s fare includes. Customers see this under &ldquo;?&rdquo; on each car. Routes not listed show tolls as excluded.</p>
      </div>
      <button onClick={() => { setError(""); setForm(EMPTY); }} className="rounded-full bg-[#FF8A05] px-5 py-3 font-bold text-white">Add route</button>
    </div>
    {error && !form && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

    {rules.length === 0 && <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">
      <p className="font-bold">Using the built-in routes</p>
      <p className="mt-1 text-sm">Bangkok ⇄ Pattaya, Rayong, Chanthaburi, Chachoengsao and Trat (with ferry) are applied automatically. Import them to edit them here. Once any route is saved, only the routes in this list apply.</p>
      <button disabled={busy} onClick={() => post({ action: "import" })} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-900 disabled:opacity-50">Import built-in routes</button>
    </div>}

    {rules.length > 0 && <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Route</th><th className="px-4 py-3">Includes</th><th className="px-4 py-3">Zones</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
        <tbody>{rules.map((r) => <tr key={r.id} className="border-t border-slate-100">
          <td className="px-4 py-3 font-bold">{r.name}{r.bidirectional && <span className="ml-2 text-xs font-normal text-slate-500">both ways</span>}</td>
          <td className="px-4 py-3">{[r.includesTolls && "Tolls", r.includesFerry && "Ferry"].filter(Boolean).join(" + ") || "Nothing extra"}</td>
          <td className="px-4 py-3 text-xs text-slate-500">From {boxText(r.origin)}<br />To {boxText(r.destination)}</td>
          <td className="px-4 py-3">{r.priority}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{r.active ? "Active" : "Off"}</span></td>
          <td className="whitespace-nowrap px-4 py-3 text-right">
            <button onClick={() => { setError(""); setForm({ id: r.id, name: r.name, origin: toStrings(r.origin), destination: toStrings(r.destination), bidirectional: r.bidirectional, includesTolls: r.includesTolls, includesFerry: r.includesFerry, active: r.active, priority: String(r.priority) }); }} className="rounded-full px-3 py-1.5 font-bold text-[#C96100] hover:bg-orange-50">Edit</button>
            <button disabled={busy} onClick={() => { if (confirm(`Delete "${r.name}"?`)) void post({ action: "delete", id: r.id }); }} className="rounded-full px-3 py-1.5 font-bold text-red-600 hover:bg-red-50">Delete</button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>}

    {form && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={form.id ? "Edit route" : "Add route"}>
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6">
        <h2 className="text-xl font-black">{form.id ? "Edit route" : "Add route"}</h2>
        <div className="mt-4 grid gap-4">
          <label className="text-sm font-bold">Route name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bangkok ⇄ Hua Hin" className={input} /></label>
          {boxFields("origin", "From zone")}
          {boxFields("destination", "To zone")}
          <div className="flex flex-wrap gap-5 text-sm font-semibold">
            {([["includesTolls", "Tolls included"], ["includesFerry", "Ferry tickets included"], ["bidirectional", "Also the return direction"], ["active", "Active"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="size-4 accent-[#FF8A05]" />{label}</label>)}
          </div>
          <label className="w-40 text-sm font-bold">Priority<input inputMode="numeric" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={input} /><span className="mt-1 block text-xs font-normal text-slate-500">Higher wins when zones overlap.</span></label>
        </div>
        {error && <p className="mt-3 text-sm font-bold text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={() => setForm(null)} className="rounded-full px-5 py-2.5 font-bold text-slate-600">Cancel</button>
          <button disabled={busy} onClick={save} className="rounded-full bg-[#FF8A05] px-6 py-2.5 font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save route"}</button>
        </div>
      </div>
    </div>}
  </div>;
}

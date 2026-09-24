"use client";

import { FormEvent, useState } from "react";
import { Building2, Home, MapPin, Plane, Plus, Trash2 } from "lucide-react";
import { PlaceAutocomplete, type PickedPlace } from "@/components/account/place-autocomplete";

type Place = { id: string; label: string; address: string };
const suggestions = ["Home", "Hotel", "Office", "Airport"];

function iconFor(label: string) {
  const l = label.toLowerCase();
  if (l.includes("home")) return Home;
  if (l.includes("airport")) return Plane;
  if (l.includes("office") || l.includes("hotel")) return Building2;
  return MapPin;
}

export function SavedPlaces({ initial }: { initial: Place[] }) {
  const [places, setPlaces] = useState(initial);
  const [adding, setAdding] = useState(initial.length === 0);
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!picked) return setError("Choose an address from the suggestions.");
    setBusy(true); setError("");
    const response = await fetch("/api/account/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, ...picked }) });
    const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.id) return setError(data.error ?? "Could not save this place.");
    setPlaces([...places, { id: data.id, label: label.trim(), address: picked.address }]);
    setLabel(""); setPicked(null); setAdding(false); setFormKey((k) => k + 1);
  }

  async function remove(id: string) {
    const previous = places;
    setPlaces(places.filter((p) => p.id !== id));
    const response = await fetch(`/api/account/places/${id}`, { method: "DELETE" });
    if (!response.ok) { setPlaces(previous); setError("Could not remove this place."); }
  }

  return <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
    {places.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">{places.map((place) => { const Icon = iconFor(place.label); return <li key={place.id} className="flex items-center gap-4 rounded-[20px] bg-white p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><Icon size={20} /></span>
      <div className="min-w-0 flex-1"><p className="font-bold">{place.label}</p><p className="truncate text-sm text-slate-600">{place.address}</p></div>
      <button onClick={() => remove(place.id)} aria-label={`Remove ${place.label}`} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={18} /></button>
    </li>; })}</ul> : null}

    {adding ? <form key={formKey} onSubmit={add} className="rounded-[20px] bg-white p-6">
      <h2 className="font-black">Add a place</h2>
      <label className="mt-4 block text-sm font-bold" htmlFor="place-label">Name</label>
      <input id="place-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Home, Hotel, Office…" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#FF8A05] focus:ring-4 focus:ring-orange-100" />
      <div className="mt-2 flex flex-wrap gap-2">{suggestions.map((s) => <button type="button" key={s} onClick={() => setLabel(s)} className="rounded-full border border-slate-200 px-3 py-1 text-sm hover:border-[#FF8A05]">{s}</button>)}</div>
      <label className="mt-5 block text-sm font-bold" htmlFor="place-address">Address</label>
      <div className="mt-2"><PlaceAutocomplete id="place-address" onPick={setPicked} /></div>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
      <div className="mt-5 flex gap-3">
        <button disabled={busy || !label.trim() || !picked} className="rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save place"}</button>
        {places.length ? <button type="button" onClick={() => { setAdding(false); setError(""); }} className="rounded-full px-5 py-3 font-bold text-slate-600">Cancel</button> : null}
      </div>
    </form> : <button onClick={() => setAdding(true)} className="flex items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-slate-300 p-5 font-bold text-slate-600 hover:border-[#FF8A05] hover:text-[#C96100]"><Plus size={19} />Add a place</button>}
    <p className="text-sm text-slate-500">Saved places appear in the search form so you can pick them as your pickup or drop-off.</p>
  </div>;
}

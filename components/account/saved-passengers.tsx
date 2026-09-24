"use client";

import { FormEvent, useState } from "react";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";

export type Passenger = { id: string; name: string; surname: string; email: string | null; phone: string | null; notes: string | null };
type Draft = { name: string; surname: string; email: string; phone: string; notes: string };
const empty: Draft = { name: "", surname: "", email: "", phone: "", notes: "" };

export function SavedPassengers({ initial }: { initial: Passenger[] }) {
  const [passengers, setPassengers] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(initial.length ? null : "new");
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function open(passenger?: Passenger) {
    setError("");
    setEditing(passenger?.id ?? "new");
    setDraft(passenger ? { name: passenger.name, surname: passenger.surname, email: passenger.email ?? "", phone: passenger.phone ?? "", notes: passenger.notes ?? "" } : empty);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const isNew = editing === "new";
    const response = await fetch(isNew ? "/api/account/passengers" : `/api/account/passengers/${editing}`, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not save this traveller.");
    const saved: Passenger = { id: isNew ? data.id! : editing!, name: draft.name.trim(), surname: draft.surname.trim(), email: draft.email.trim().toLowerCase() || null, phone: draft.phone.trim() || null, notes: draft.notes.trim() || null };
    setPassengers(isNew ? [...passengers, saved] : passengers.map((p) => (p.id === saved.id ? saved : p)));
    setEditing(null);
  }

  async function remove(id: string) {
    const previous = passengers;
    setPassengers(passengers.filter((p) => p.id !== id));
    const response = await fetch(`/api/account/passengers/${id}`, { method: "DELETE" });
    if (!response.ok) { setPassengers(previous); setError("Could not remove this traveller."); }
  }

  const field = "mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#FF8A05] focus:ring-4 focus:ring-orange-100";
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value });
  const form = <form onSubmit={save} className="rounded-[20px] bg-white p-6">
    <h2 className="font-black">{editing === "new" ? "Add a traveller" : "Edit traveller"}</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-bold">First name<input className={field} value={draft.name} onChange={set("name")} maxLength={80} autoComplete="off" /></label>
      <label className="block text-sm font-bold">Surname<input className={field} value={draft.surname} onChange={set("surname")} maxLength={80} autoComplete="off" /></label>
      <label className="block text-sm font-bold">Email <span className="font-normal text-slate-500">(optional)</span><input className={field} type="email" value={draft.email} onChange={set("email")} autoComplete="off" /></label>
      <label className="block text-sm font-bold">Phone <span className="font-normal text-slate-500">(optional)</span><input className={field} type="tel" value={draft.phone} onChange={set("phone")} maxLength={40} placeholder="+66 81 234 5678" autoComplete="off" /></label>
      <label className="block text-sm font-bold sm:col-span-2">Notes for the driver <span className="font-normal text-slate-500">(optional)</span><input className={field} value={draft.notes} onChange={set("notes")} maxLength={300} placeholder="e.g. child seat needed, wheelchair" /></label>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
    <div className="mt-5 flex gap-3">
      <button disabled={busy || !draft.name.trim() || !draft.surname.trim()} className="rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save traveller"}</button>
      {passengers.length ? <button type="button" onClick={() => setEditing(null)} className="rounded-full px-5 py-3 font-bold text-slate-600">Cancel</button> : null}
    </div>
  </form>;

  return <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
    {passengers.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">{passengers.map((p) => editing === p.id ? <li key={p.id}>{form}</li> : <li key={p.id} className="flex items-center gap-4 rounded-[20px] bg-white p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><UserRound size={20} /></span>
      <div className="min-w-0 flex-1"><p className="font-bold">{p.name} {p.surname}</p><p className="truncate text-sm text-slate-600">{[p.phone, p.email, p.notes].filter(Boolean).join(" · ") || "No contact details"}</p></div>
      <button onClick={() => open(p)} aria-label={`Edit ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Pencil size={17} /></button>
      <button onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={18} /></button>
    </li>)}</ul> : null}
    {editing === "new" ? form : editing === null ? <button onClick={() => open()} className="flex items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-slate-300 p-5 font-bold text-slate-600 hover:border-[#FF8A05] hover:text-[#C96100]"><Plus size={19} />Add a traveller</button> : null}
    <p className="text-sm text-slate-500">When you book, choose a saved traveller to fill in their details automatically.</p>
  </div>;
}

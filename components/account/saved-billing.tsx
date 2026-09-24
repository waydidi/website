"use client";

import { FormEvent, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";

export type BillingProfile = { id: string; name: string; taxId: string; branch: string; address: string };
type Draft = Omit<BillingProfile, "id">;
const empty: Draft = { name: "", taxId: "", branch: "", address: "" };

export function SavedBilling({ initial }: { initial: BillingProfile[] }) {
  const [profiles, setProfiles] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(initial.length ? null : "new");
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function open(profile?: BillingProfile) {
    setError("");
    setEditing(profile?.id ?? "new");
    setDraft(profile ? { name: profile.name, taxId: profile.taxId, branch: profile.branch, address: profile.address } : empty);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const isNew = editing === "new";
    const response = await fetch(isNew ? "/api/account/billing" : `/api/account/billing/${editing}`, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = (await response.json().catch(() => ({}))) as { profile?: BillingProfile; error?: string };
    setBusy(false);
    if (!response.ok || !data.profile) return setError(data.error ?? "Could not save these billing details.");
    setProfiles(isNew ? [...profiles, data.profile] : profiles.map((p) => (p.id === data.profile!.id ? data.profile! : p)));
    setEditing(null);
  }

  async function remove(id: string) {
    const previous = profiles;
    setProfiles(profiles.filter((p) => p.id !== id));
    const response = await fetch(`/api/account/billing/${id}`, { method: "DELETE" });
    if (!response.ok) { setProfiles(previous); setError("Could not remove these billing details."); }
  }

  const field = "mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#FF8A05] focus:ring-4 focus:ring-orange-100";
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value });
  const form = <form onSubmit={save} className="rounded-[20px] bg-white p-6">
    <h2 className="font-black">{editing === "new" ? "Add billing details" : "Edit billing details"}</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-bold sm:col-span-2">Company or full name<input className={field} value={draft.name} onChange={set("name")} maxLength={200} autoComplete="organization" /></label>
      <label className="block text-sm font-bold">Tax ID (13 digits)<input className={field} value={draft.taxId} onChange={set("taxId")} maxLength={17} inputMode="numeric" autoComplete="off" /></label>
      <label className="block text-sm font-bold">Branch <span className="font-normal text-slate-500">(optional)</span><input className={field} value={draft.branch} onChange={set("branch")} maxLength={60} placeholder="Head office or 00001" /></label>
      <label className="block text-sm font-bold sm:col-span-2">Billing address<textarea className={`${field} resize-none`} rows={3} value={draft.address} onChange={set("address")} maxLength={500} autoComplete="street-address" /></label>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
    <div className="mt-5 flex gap-3">
      <button disabled={busy || !draft.name.trim() || !draft.taxId.trim() || !draft.address.trim()} className="rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save billing details"}</button>
      {profiles.length ? <button type="button" onClick={() => setEditing(null)} className="rounded-full px-5 py-3 font-bold text-slate-600">Cancel</button> : null}
    </div>
  </form>;

  return <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
    {profiles.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">{profiles.map((p) => editing === p.id ? <li key={p.id}>{form}</li> : <li key={p.id} className="flex items-center gap-4 rounded-[20px] bg-white p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><Building2 size={20} /></span>
      <div className="min-w-0 flex-1"><p className="font-bold">{p.name}</p><p className="truncate text-sm text-slate-600">Tax ID {p.taxId} · {p.branch}</p><p className="truncate text-sm text-slate-500">{p.address}</p></div>
      <button onClick={() => open(p)} aria-label={`Edit ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Pencil size={17} /></button>
      <button onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={18} /></button>
    </li>)}</ul> : null}
    {editing === "new" ? form : editing === null ? <button onClick={() => open()} className="flex items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-slate-300 p-5 font-bold text-slate-600 hover:border-[#FF8A05] hover:text-[#C96100]"><Plus size={19} />Add billing details</button> : null}
    <p className="text-sm text-slate-500">When you request a tax invoice at checkout, pick saved details to fill them in automatically.</p>
  </div>;
}

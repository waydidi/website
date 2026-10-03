"use client";

import Link from "next/link";
import { LoaderCircle, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SupplierRow } from "@/lib/attractions";
import { api, areaCls, btnPrimary, btnQuiet, Field, inputCls } from "./ui";

type Supplier = SupplierRow & { attractions: { id: string; name: string }[] };
type Draft = { id?: string; name: string; kind: string; contactName: string; phone: string; lineId: string; whatsapp: string; email: string; notes: string };
const KINDS = ["attraction", "restaurant", "boat", "guide", "hotel", "other"];
const blank: Draft = { name: "", kind: "attraction", contactName: "", phone: "", lineId: "", whatsapp: "", email: "", notes: "" };

export function SuppliersWorkspace() {
  const [items, setItems] = useState<Supplier[] | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => setItems((await api<{ suppliers: Supplier[] }>("/api/admin/suppliers", "GET")).suppliers), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!draft) return;
    setBusy(true); setError("");
    try { await api("/api/admin/suppliers", "POST", draft); setDraft(null); await load(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove(s: Supplier) {
    if (!confirm(`Delete ${s.name}? ${s.attractions.length} linked attraction(s) will have no supplier.`)) return;
    await api("/api/admin/suppliers", "DELETE", { id: s.id }); await load();
  }
  const shown = (items ?? []).filter((s) => `${s.name} ${s.contactName ?? ""} ${s.kind} ${s.attractions.map((a) => a.name).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const digits = (v: string) => v.replace(/[^\d+]/g, "");

  return <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-[28px] font-black tracking-[-.03em]">Supplier contacts</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-slate-500">Who to call for tickets, reservations and changes. Link a supplier to an attraction and it shows in the trip planner.</p></div>
      <div className="flex gap-2"><Link href="/admin/attractions" className={btnQuiet}>Attractions</Link><button type="button" onClick={() => { setError(""); setDraft({ ...blank }); }} className={btnPrimary}><Plus size={17} />Add supplier</button></div>
    </div>
    <label className="relative mt-5 block"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers or attractions" className={`${inputCls} pl-9`} /></label>
    {items === null && <LoaderCircle className="mx-auto mt-10 animate-spin text-slate-400" />}
    {items?.length === 0 && <p className="mt-10 text-center text-slate-500">No suppliers yet.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((s) => <article key={s.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2"><div><h2 className="text-[17px] font-bold">{s.name}</h2><p className="text-[13px] capitalize text-slate-500">{s.kind}{s.contactName ? ` · ${s.contactName}` : ""}</p></div>
          <div className="flex"><button type="button" onClick={() => setDraft({ id: s.id, name: s.name, kind: s.kind, contactName: s.contactName ?? "", phone: s.phone ?? "", lineId: s.lineId ?? "", whatsapp: s.whatsapp ?? "", email: s.email ?? "", notes: s.notes ?? "" })} aria-label={`Edit ${s.name}`} className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-orange-50 hover:text-[#C96100]"><Pencil size={16} /></button>
            <button type="button" onClick={() => void remove(s)} aria-label={`Delete ${s.name}`} className="grid size-9 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button></div></div>
        <div className="mt-3 grid gap-1.5 text-[14px]">
          {s.phone && <a href={`tel:${digits(s.phone)}`} className="flex items-center gap-2 text-slate-700 hover:text-[#C96100]"><Phone size={15} />{s.phone}</a>}
          {s.whatsapp && <a href={`https://wa.me/${digits(s.whatsapp).replace("+", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-700 hover:text-[#C96100]"><MessageCircle size={15} />WhatsApp {s.whatsapp}</a>}
          {s.lineId && <p className="flex items-center gap-2 text-slate-700"><MessageCircle size={15} />LINE {s.lineId}</p>}
          {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-2 text-slate-700 hover:text-[#C96100]"><Mail size={15} />{s.email}</a>}
        </div>
        {s.notes && <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600">{s.notes}</p>}
        {s.attractions.length > 0 && <p className="mt-3 text-[13px] text-slate-500">For: {s.attractions.map((a) => a.name).join(", ")}</p>}
      </article>)}
    </div>
    {draft && <div role="dialog" aria-modal="true" aria-labelledby="supplier-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) setDraft(null); }}>
      <form onSubmit={save} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 id="supplier-title" className="text-[20px] font-bold">{draft.id ? "Edit supplier" : "Add supplier"}</h2><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={20} /></button></div>
        <div className="mt-4 grid gap-3">
          <Field label="Name"><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={`${inputCls} capitalize`}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Contact person"><input value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputCls} /></Field>
            <Field label="WhatsApp"><input value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} className={inputCls} /></Field>
            <Field label="LINE ID"><input value={draft.lineId} onChange={(e) => setDraft({ ...draft, lineId: e.target.value })} className={inputCls} /></Field>
            <Field label="Email"><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Notes" hint="Booking cut-off, payment terms, agent rates"><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={areaCls} /></Field>
        </div>
        {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} mt-4 w-full`}>{busy && <LoaderCircle size={16} className="animate-spin" />}Save supplier</button>
      </form>
    </div>}
  </main>;
}

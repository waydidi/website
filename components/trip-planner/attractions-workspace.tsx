"use client";

import Link from "next/link";
import { BadgeCheck, CalendarX2, Clock, ImagePlus, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttractionView, SupplierRow } from "@/lib/attractions";
import { BEST_TIMES, MEAL_SLOTS, PLACE_TYPE_LABEL, PLACE_TYPES, PRICE_LEVEL, VIBES } from "@/lib/place-taxonomy";
import { PACKING_TAGS, type Program, type ScheduleException } from "@/lib/trip-plan";
import { PlacePicker } from "./place-picker";
import { api, selectCls, areaCls, btnPrimary, btnQuiet, DAYS, Field, inputCls, toList, uploadImage } from "./ui";
import { Modal, ModalTitle } from "@/components/ui/modal";

type Item = AttractionView & { usedIn: number };
type Draft = Omit<AttractionView, "createdAt" | "updatedAt" | "verifiedAt" | "verifiedBy" | "tagsJson" | "closedDaysJson" | "highlightsJson" | "bringJson" | "galleryJson" | "programsJson" | "exceptionsJson" | "mealSlotsJson" | "vibesJson" | "i18nJson" | "seedKey" | "id"> & { id?: string };

const CATEGORIES = PLACE_TYPES;
const blank: Draft = {
  name: "", customerName: null, area: "", address: null, latitude: null, longitude: null, googlePlaceId: null, category: "sight",
  tags: [], openTime: "09:00", closeTime: "17:00", lastEntry: null, closedDays: [], durationMin: 60, arrivalBufferMin: 0,
  bookingRequired: false, weatherSensitive: false, dressCode: null, description: null, highlights: [], bring: [],
  coverImage: null, gallery: [], imageCredit: null, website: null, phone: null, internalNotes: null, supplierId: null,
  programs: [], exceptions: [], status: "active",
  mealSlots: [], priceLevel: null, avgSpend: null, neighbourhood: null, bestTime: null, vibes: [], dropoffNote: null, reservationNote: null, shortLine: null, published: false, i18n: {},
};
const STALE = 180;
const age = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never");

export function AttractionsWorkspace() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [hood, setHood] = useState("");
  const [state, setState] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ attractions: Item[]; suppliers: SupplierRow[] }>("/api/admin/attractions", "GET");
    setItems(data.attractions); setSuppliers(data.suppliers);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);

  const areas = useMemo(() => [...new Set((items ?? []).map((i) => i.area).filter(Boolean))].sort(), [items]);
  const hoods = useMemo(() => [...new Set((items ?? []).filter((i) => !area || i.area === area).map((i) => i.neighbourhood).filter((x): x is string => Boolean(x)))].sort(), [items, area]);
  const shown = (items ?? []).filter((i) => (!area || i.area === area) && (!type || i.category === type) && (!hood || i.neighbourhood === hood)
    && (!state || (state === "unverified" ? !i.verifiedAt : state === "published" ? i.published : !i.published)) && `${i.name} ${i.customerName ?? ""} ${i.category} ${i.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  async function save(d: Draft) {
    setBusy(true); setError("");
    try { await api("/api/admin/attractions", "POST", d); setDraft(null); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function verify(id: string) { await api("/api/admin/attractions", "POST", { verify: id }); await load(); }
  async function hide(i: Item) {
    if (!confirm(`Hide ${i.name}? Trips that already use it keep it.`)) return;
    await api("/api/admin/attractions", "DELETE", { id: i.id }); await load();
  }

  return <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="sr-only">Attractions</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-slate-500">Places, opening hours, programs with fixed session times, and what customers see. The trip planner uses these; approved trips keep their own copy.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={async () => { if (!confirm("Add the Bangkok starter list (about 55 places) as unverified drafts? Places already added are skipped.")) return; setBusy(true); try { const r = await api<{ added: number; skipped: number }>("/api/admin/attractions", "POST", { importStarter: "bangkok" }); alert(`Added ${r.added} places${r.skipped ? `, skipped ${r.skipped} already in the library` : ""}.`); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }} className={btnQuiet}>Bangkok starter list</button><Link href="/admin/suppliers" className={btnQuiet}>Supplier contacts</Link>
        <button type="button" onClick={() => { setError(""); setDraft({ ...blank }); }} className={btnPrimary}><Plus size={17} />Add attraction</button></div>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      <label className="relative min-w-[240px] flex-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search attractions, categories or tags" className={`${inputCls} pl-9`} /></label>
      <select value={area} onChange={(e) => setArea(e.target.value)} className={`${selectCls}`} aria-label="Area"><option value="">All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
      <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Type"><option value="">All types</option>{PLACE_TYPES.map((t) => <option key={t} value={t}>{PLACE_TYPE_LABEL[t]}</option>)}</select>
      {hoods.length > 0 && <select value={hood} onChange={(e) => setHood(e.target.value)} className={selectCls} aria-label="Neighbourhood"><option value="">All neighbourhoods</option>{hoods.map((h) => <option key={h}>{h}</option>)}</select>}
      <select value={state} onChange={(e) => setState(e.target.value)} className={selectCls} aria-label="Status"><option value="">Any status</option><option value="unverified">Not verified</option><option value="draft">Not on website</option><option value="published">On website</option></select>
      <p className="w-full text-[13px] text-slate-500">{shown.length} of {items?.length ?? 0} places</p>
    </div>

    <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600"><tr>{["Attraction", "Area", "Hours", "Verified", "Used in", ""].map((h) => <th key={h} className="h-12 px-4 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {items === null && <tr><td colSpan={6} className="py-12 text-center"><LoaderCircle className="mx-auto animate-spin text-slate-400" /></td></tr>}
          {items?.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-slate-500">No attractions yet. Add the places you visit most often.</td></tr>}
          {shown.map((i) => { const days = age(i.verifiedAt); const stale = days === null || days > STALE; return <tr key={i.id} className={i.status === "hidden" ? "opacity-50" : ""}>
            <td className="px-4 py-3"><div className="flex items-center gap-3">
              {(i.coverImage ?? i.gallery[0]) ? <img src={i.coverImage ?? i.gallery[0]} alt="" className="h-16 w-24 shrink-0 rounded-[10px] object-cover" /> : <span className="grid h-16 w-24 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-400" title="No photo yet"><ImagePlus size={18} /></span>}
              <div><p className="font-semibold text-slate-900">{i.name}{i.status === "hidden" && " (hidden)"}</p><p className="text-[12px] text-slate-500">{PLACE_TYPE_LABEL[i.category as keyof typeof PLACE_TYPE_LABEL] ?? i.category}{i.neighbourhood ? ` · ${i.neighbourhood}` : ""}{i.priceLevel ? ` · ${PRICE_LEVEL[i.priceLevel]}` : ""}{i.published ? " · on website" : ""}{i.latitude == null && " · no map location"}</p></div></div></td>
            <td className="px-4 py-3">{i.area || "—"}</td>
            <td className="whitespace-nowrap px-4 py-3">{i.openTime && i.closeTime ? `${i.openTime}–${i.closeTime}` : "Any time"}{i.closedDays.length > 0 && <p className="text-[12px] text-slate-500">Closed {i.closedDays.map((d) => DAYS[d]).join(", ")}</p>}</td>
            <td className="px-4 py-3"><p className={stale ? "font-semibold text-amber-700" : "text-slate-700"}>{fmtDate(i.verifiedAt)}</p>{i.verifiedBy && <p className="text-[12px] text-slate-500">{i.verifiedBy}</p>}
              <button type="button" onClick={() => void verify(i.id)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-darker hover:underline"><BadgeCheck size={13} />Mark as verified</button></td>
            <td className="px-4 py-3">{i.usedIn} trip{i.usedIn === 1 ? "" : "s"}</td>
            <td className="px-4 py-3"><div className="flex justify-end gap-1">
              <button type="button" onClick={() => { setError(""); setDraft(toDraft(i)); }} aria-label={`Edit ${i.name}`} className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-orange-50 hover:text-brand-darker"><Pencil size={16} /></button>
              {i.status === "active" && <button type="button" onClick={() => void hide(i)} aria-label={`Hide ${i.name}`} className="grid size-9 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
            </div></td>
          </tr>; })}
        </tbody>
      </table></div>
    </section>
    {error && !draft && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
    {draft && <Editor draft={draft} setDraft={setDraft} suppliers={suppliers} areas={areas} hoods={[...new Set((items ?? []).map((i) => i.neighbourhood).filter((x): x is string => Boolean(x)))].sort()} verified={Boolean(items?.find((i) => i.id === draft.id)?.verifiedAt)} busy={busy} error={error} onSave={save} />}
  </main>;
}

function toDraft(i: Item): Draft {
  const { usedIn: _u, createdAt: _c, updatedAt: _up, verifiedAt: _v, verifiedBy: _vb, tagsJson: _t, closedDaysJson: _cd, highlightsJson: _h, bringJson: _b, galleryJson: _g, programsJson: _p, exceptionsJson: _e, mealSlotsJson: _m, vibesJson: _vb2, i18nJson: _i, seedKey: _sk, ...rest } = i;
  return rest;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-3 border-t border-slate-100 pt-4"><legend className="pr-2 text-[15px] font-bold text-slate-900">{title}</legend>{children}</fieldset>;
}

function Editor({ draft, setDraft, suppliers, areas, hoods, verified, busy, error, onSave }: { draft: Draft; setDraft: (d: Draft | null) => void; suppliers: SupplierRow[]; areas: string[]; hoods: string[]; verified: boolean; busy: boolean; error: string; onSave: (d: Draft) => void }) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const [uploading, setUploading] = useState(false);
  const setProgram = (i: number, patch: Partial<Program>) => set({ programs: draft.programs.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setException = (i: number, patch: Partial<ScheduleException>) => set({ exceptions: draft.exceptions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  async function addImages(files: FileList | null, cover: boolean) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all([...files].slice(0, cover ? 1 : 12).map(uploadImage));
      if (cover) set({ coverImage: urls[0] }); else set({ gallery: [...draft.gallery, ...urls].slice(0, 12) });
    } catch (e) { alert((e as Error).message); } finally { setUploading(false); }
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  return <Modal open onClose={() => setDraft(null)} locked={busy} overlayClassName="z-50 bg-black/40 justify-end items-stretch p-0" asChild>
    <form onSubmit={(e) => { e.preventDefault(); onSave(draft); }} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 sm:p-7">
      <div className="flex items-center justify-between"><ModalTitle className="text-[22px] font-bold">{draft.id ? "Edit attraction" : "Add attraction"}</ModalTitle>
        <button type="button" onClick={() => setDraft(null)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={20} /></button></div>
      <div className="mt-4 grid gap-5">
        <Section title="Basics">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Internal name"><input required value={draft.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="Phuket Elephant Sanctuary" /></Field>
            <Field label="Name customers see" hint="Leave empty to use the internal name"><input value={draft.customerName ?? ""} onChange={(e) => set({ customerName: e.target.value })} className={inputCls} /></Field>
            <Field label="Area"><input list="attraction-areas" value={draft.area} onChange={(e) => set({ area: e.target.value })} className={inputCls} placeholder="Phuket" /><datalist id="attraction-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist></Field>
            <Field label="Category"><select value={draft.category} onChange={(e) => set({ category: e.target.value })} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{PLACE_TYPE_LABEL[c]}</option>)}</select></Field>
          </div>
          <Field label="Location" hint={draft.latitude != null ? `Map position saved (${draft.latitude.toFixed(4)}, ${draft.longitude?.toFixed(4)})` : "Pick a suggestion so the planner can work out drive times"}>
            <PlacePicker value={draft.address ?? ""} onChange={(p) => set({ address: p.text, ...(p.lat != null ? { latitude: p.lat, longitude: p.lng, googlePlaceId: p.placeId } : {}) })} className={inputCls} placeholder="Search Google Maps" /></Field>
          <div>
            <p className="text-[13px] font-semibold">Tags <span className="font-normal text-slate-500">(build the customer&apos;s packing list)</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{PACKING_TAGS.map((t) => { const on = draft.tags.includes(t); return <button key={t} type="button" onClick={() => set({ tags: on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })} className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-brand bg-orange-50 font-semibold text-brand-darker" : "border-slate-200 text-slate-600"}`}>{t}</button>; })}</div>
          </div>
        </Section>

        <Section title="Opening hours">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Opens"><input type="time" value={draft.openTime ?? ""} onChange={(e) => set({ openTime: e.target.value || null })} className={inputCls} /></Field>
            <Field label="Closes"><input type="time" value={draft.closeTime ?? ""} onChange={(e) => set({ closeTime: e.target.value || null })} className={inputCls} /></Field>
            <Field label="Last entry"><input type="time" value={draft.lastEntry ?? ""} onChange={(e) => set({ lastEntry: e.target.value || null })} className={inputCls} /></Field>
          </div>
          <div><p className="text-[13px] font-semibold">Closed every</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{DAYS.map((d, i) => { const on = draft.closedDays.includes(i); return <button key={d} type="button" onClick={() => set({ closedDays: on ? draft.closedDays.filter((x) => x !== i) : [...draft.closedDays, i] })} className={`h-9 w-12 rounded-lg border text-[13px] ${on ? "border-red-300 bg-red-50 font-semibold text-red-700" : "border-slate-200 text-slate-600"}`}>{d}</button>; })}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usual visit (minutes)"><input type="number" min={5} max={720} value={draft.durationMin} onChange={(e) => set({ durationMin: num(e.target.value) })} className={inputCls} /></Field>
            <Field label="Arrive early by (minutes)"><input type="number" min={0} max={180} value={draft.arrivalBufferMin} onChange={(e) => set({ arrivalBufferMin: num(e.target.value) })} className={inputCls} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.bookingRequired} onChange={(e) => set({ bookingRequired: e.target.checked })} className="size-4 accent-brand" />Booking required</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.weatherSensitive} onChange={(e) => set({ weatherSensitive: e.target.checked })} className="size-4 accent-brand" />Weather sensitive</label>
          </div>
        </Section>

        <Section title="Programs and fixed sessions">
          <p className="-mt-1 text-[13px] text-slate-500">A program with session times becomes a fixed anchor in the plan. Leave sessions empty for &quot;any time during opening hours&quot;.</p>
          {draft.programs.map((p, i) => <div key={i} className="grid gap-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <Field label="Program" className="flex-1"><input required value={p.name} onChange={(e) => setProgram(i, { name: e.target.value, id: p.id || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) })} className={inputCls} placeholder="Canopy Walkway" /></Field>
              <button type="button" onClick={() => set({ programs: draft.programs.filter((_, j) => j !== i) })} aria-label="Remove program" className="mt-6 grid size-10 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Minutes"><input type="number" min={5} value={p.durationMin} onChange={(e) => setProgram(i, { durationMin: num(e.target.value) })} className={inputCls} /></Field>
              <Field label="Check-in before"><input type="number" min={0} value={p.arrivalBufferMin ?? 0} onChange={(e) => setProgram(i, { arrivalBufferMin: num(e.target.value) })} className={inputCls} /></Field>
              <Field label="Adult THB"><input type="number" min={0} value={p.feeAdult ?? 0} onChange={(e) => setProgram(i, { feeAdult: num(e.target.value) })} className={inputCls} /></Field>
              <Field label="Child THB"><input type="number" min={0} value={p.feeChild ?? 0} onChange={(e) => setProgram(i, { feeChild: num(e.target.value) })} className={inputCls} /></Field>
            </div>
            <div className="flex flex-wrap gap-4 text-[14px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={p.feeIncluded ?? false} onChange={(e) => setProgram(i, { feeIncluded: e.target.checked })} className="size-4 accent-brand" />Ticket included in our price</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={p.bookingRequired ?? false} onChange={(e) => setProgram(i, { bookingRequired: e.target.checked })} className="size-4 accent-brand" />Needs a reservation</label>
            </div>
            <div><p className="flex items-center gap-1.5 text-[13px] font-semibold"><Clock size={14} />Sessions</p>
              {p.sessions.map((s, k) => <div key={k} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="time" required value={s.time} onChange={(e) => setProgram(i, { sessions: p.sessions.map((x, m) => (m === k ? { ...x, time: e.target.value } : x)) })} className={`${inputCls} w-32`} aria-label="Session time" />
                {DAYS.map((d, di) => { const on = !s.days?.length || s.days.includes(di); return <button key={d} type="button" onClick={() => { const all = s.days?.length ? s.days : [0, 1, 2, 3, 4, 5, 6]; const next = on ? all.filter((x) => x !== di) : [...all, di].sort(); setProgram(i, { sessions: p.sessions.map((x, m) => (m === k ? { ...x, days: next.length === 7 ? undefined : next } : x)) }); }} className={`h-8 w-10 rounded-md border text-[12px] ${on ? "border-brand bg-orange-50 text-brand-darker" : "border-slate-200 text-slate-400"}`}>{d}</button>; })}
                <button type="button" onClick={() => setProgram(i, { sessions: p.sessions.filter((_, m) => m !== k) })} aria-label="Remove session" className="text-slate-400 hover:text-red-600"><X size={16} /></button>
              </div>)}
              <button type="button" onClick={() => setProgram(i, { sessions: [...p.sessions, { time: "09:30" }] })} className="mt-2 text-[13px] font-semibold text-brand-darker hover:underline">+ Add session</button></div>
          </div>)}
          <button type="button" onClick={() => set({ programs: [...draft.programs, { id: "", name: "", durationMin: draft.durationMin, arrivalBufferMin: draft.arrivalBufferMin, feeAdult: 0, feeChild: 0, feeIncluded: false, bookingRequired: false, sessions: [] }] })} className={btnQuiet}><Plus size={16} />Add program</button>
        </Section>

        <Section title="Schedule exceptions">
          <p className="-mt-1 text-[13px] text-slate-500">Holidays, blackout days or temporary session times. They override the normal schedule on those dates.</p>
          {draft.exceptions.map((x, i) => <div key={i} className="grid gap-2 rounded-2xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="From"><input type="date" required value={x.from} onChange={(e) => setException(i, { from: e.target.value })} className={inputCls} /></Field>
              <Field label="To"><input type="date" required value={x.to} onChange={(e) => setException(i, { to: e.target.value })} className={inputCls} /></Field>
              <Field label="Applies to"><select value={x.programId ?? ""} onChange={(e) => setException(i, { programId: e.target.value || undefined })} className={inputCls}><option value="">Whole attraction</option>{draft.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <button type="button" onClick={() => set({ exceptions: draft.exceptions.filter((_, j) => j !== i) })} aria-label="Remove exception" className="grid size-11 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={x.closed ?? false} onChange={(e) => setException(i, { closed: e.target.checked })} className="size-4 accent-brand" /><CalendarX2 size={15} />Closed on these dates</label>
            {!x.closed && <Field label="Session times on these dates" hint="Comma separated, e.g. 09:00, 10:30, 13:30"><input value={(x.sessions ?? []).join(", ")} onChange={(e) => setException(i, { sessions: toList(e.target.value).filter((t) => /^\d{2}:\d{2}$/.test(t)) })} className={inputCls} /></Field>}
            <input value={x.note ?? ""} onChange={(e) => setException(i, { note: e.target.value })} placeholder="Note (e.g. Songkran)" className={inputCls} aria-label="Note" />
          </div>)}
          <button type="button" onClick={() => set({ exceptions: [...draft.exceptions, { from: "", to: "", closed: true }] })} className={btnQuiet}><Plus size={16} />Add exception</button>
        </Section>

        <Section title="What customers see">
          <Field label="Short description"><textarea value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} className={areaCls} /></Field>
          <Field label="Highlights" hint="One per line"><textarea value={draft.highlights.join("\n")} onChange={(e) => set({ highlights: toList(e.target.value) })} className={areaCls} /></Field>
          <Field label="What to bring" hint="One per line; added to the packing list"><textarea value={draft.bring.join("\n")} onChange={(e) => set({ bring: toList(e.target.value) })} className={areaCls} /></Field>
          <Field label="Dress code"><input value={draft.dressCode ?? ""} onChange={(e) => set({ dressCode: e.target.value })} className={inputCls} placeholder="Shoulders and knees covered" /></Field>
          <div className="grid gap-2">
            <p className="text-[13px] font-semibold">Cover photo and gallery {uploading && <LoaderCircle size={14} className="inline animate-spin" />}</p>
            <div className="flex flex-wrap gap-2">
              <label className="relative grid size-24 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 text-[12px] text-slate-500">{draft.coverImage ? <img src={draft.coverImage} alt="Cover" className="absolute inset-0 size-full object-cover" /> : <span className="grid place-items-center gap-1"><ImagePlus size={18} />Cover</span>}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void addImages(e.target.files, true)} /></label>
              {draft.gallery.map((g, i) => <div key={g} className="relative size-24 overflow-hidden rounded-xl"><img src={g} alt={`Gallery ${i + 1}`} className="size-full object-cover" /><button type="button" onClick={() => set({ gallery: draft.gallery.filter((x) => x !== g) })} aria-label="Remove photo" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X size={13} /></button></div>)}
              <label className="grid size-24 cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 text-[12px] text-slate-500"><span className="grid place-items-center gap-1"><Plus size={18} />Photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void addImages(e.target.files, false)} /></label>
            </div>
            <Field label="Photo credit / licence" hint="Where the photos come from, e.g. own photos or supplier permission"><input value={draft.imageCredit ?? ""} onChange={(e) => set({ imageCredit: e.target.value })} className={inputCls} /></Field>
          </div>
        </Section>

        <Section title="For packages and the website">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Neighbourhood"><input list="place-hoods" value={draft.neighbourhood ?? ""} onChange={(e) => set({ neighbourhood: e.target.value })} className={inputCls} placeholder="Rattanakosin, Silom, Thonglor…" /><datalist id="place-hoods">{hoods.map((h) => <option key={h} value={h} />)}</datalist></Field>
            <Field label="Best time"><select value={draft.bestTime ?? ""} onChange={(e) => set({ bestTime: e.target.value || null })} className={inputCls}><option value="">—</option>{BEST_TIMES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Price level"><select value={draft.priceLevel ?? ""} onChange={(e) => set({ priceLevel: e.target.value ? Number(e.target.value) : null })} className={inputCls}><option value="">—</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PRICE_LEVEL[n]}</option>)}</select></Field>
            <Field label="Average spend per person (THB)"><input type="number" min={0} value={draft.avgSpend ?? ""} onChange={(e) => set({ avgSpend: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : null })} className={inputCls} /></Field>
          </div>
          <div><p className="text-[13px] font-semibold">Meal slots <span className="font-normal text-slate-500">(cafés and restaurants)</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{MEAL_SLOTS.map((m) => { const on = draft.mealSlots.includes(m); return <button key={m} type="button" onClick={() => set({ mealSlots: toggle(draft.mealSlots, m) as Draft["mealSlots"] })} className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-brand bg-orange-50 font-semibold text-brand-darker" : "border-slate-200 text-slate-600"}`}>{m}</button>; })}</div></div>
          <div><p className="text-[13px] font-semibold">Good for</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{VIBES.map((v) => { const on = draft.vibes.includes(v); return <button key={v} type="button" onClick={() => set({ vibes: toggle(draft.vibes, v) as Draft["vibes"] })} className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-brand bg-orange-50 font-semibold text-brand-darker" : "border-slate-200 text-slate-600"}`}>{v}</button>; })}</div></div>
          <Field label="One-line pitch" hint="Shown on package cards, e.g. “Riverside coffee facing Wat Arun”"><input maxLength={160} value={draft.shortLine ?? ""} onChange={(e) => set({ shortLine: e.target.value })} className={inputCls} /></Field>
          <Field label="Drop-off note for the driver" hint="Where the car stops and how far to walk"><input value={draft.dropoffNote ?? ""} onChange={(e) => set({ dropoffNote: e.target.value })} className={inputCls} /></Field>
          <Field label="Reservation or queue warning"><input value={draft.reservationNote ?? ""} onChange={(e) => set({ reservationNote: e.target.value })} className={inputCls} placeholder="Book 2 days ahead; queues after 11:00" /></Field>
          <details className="rounded-2xl border border-slate-200 p-3"><summary className="cursor-pointer text-[14px] font-semibold">Thai and Chinese text</summary>
            {(["th", "zh"] as const).map((l) => <div key={l} className="mt-3 grid gap-2"><p className="text-[13px] font-bold">{l === "th" ? "Thai" : "Chinese"}</p>
              <input value={draft.i18n[l]?.name ?? ""} onChange={(e) => set({ i18n: { ...draft.i18n, [l]: { ...draft.i18n[l], name: e.target.value } } })} placeholder="Name" className={inputCls} aria-label={`${l} name`} />
              <input value={draft.i18n[l]?.shortLine ?? ""} onChange={(e) => set({ i18n: { ...draft.i18n, [l]: { ...draft.i18n[l], shortLine: e.target.value } } })} placeholder="One-line pitch" className={inputCls} aria-label={`${l} pitch`} />
              <textarea value={draft.i18n[l]?.description ?? ""} onChange={(e) => set({ i18n: { ...draft.i18n, [l]: { ...draft.i18n[l], description: e.target.value } } })} placeholder="Description" className={areaCls} aria-label={`${l} description`} /></div>)}
          </details>
          <label className="flex items-start gap-2 text-[14px]"><input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} className="mt-1 size-4 accent-brand" /><span>Show on the website and in sellable packages{!verified && <span className="block text-[12px] font-semibold text-amber-700">Check hours, prices, location and photos and press “Mark as verified” first.</span>}</span></label>
        </Section>

        <Section title="Supplier and internal notes">
          <Field label="Supplier contact" hint="Manage contacts on the Supplier contacts page"><select value={draft.supplierId ?? ""} onChange={(e) => set({ supplierId: e.target.value || null })} className={inputCls}><option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ""}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website"><input value={draft.website ?? ""} onChange={(e) => set({ website: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Internal notes" hint="Only staff see these"><textarea value={draft.internalNotes ?? ""} onChange={(e) => set({ internalNotes: e.target.value })} className={areaCls} /></Field>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={draft.status === "active"} onChange={(e) => set({ status: e.target.checked ? "active" : "hidden" })} className="size-4 accent-brand" />Available in the planner</label>
        </Section>
      </div>
      {error && <p role="alert" className="mt-4 text-[13px] font-semibold text-red-600">{error}</p>}
      <div className="sticky bottom-0 -mx-5 mt-5 border-t border-slate-100 bg-white px-5 py-3 sm:-mx-7 sm:px-7"><button type="submit" disabled={busy || uploading} className={`${btnPrimary} w-full`}>{busy && <LoaderCircle size={16} className="animate-spin" />}Save attraction</button></div>
    </form>
  </Modal>;
}

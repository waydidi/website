"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Copy, ExternalLink, GripVertical, LoaderCircle, Lock, MapPin, Phone, Plus, Send, Sparkles, Trash2, Unlock, Utensils, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttractionView, SupplierRow } from "@/lib/attractions";
import type { TripInput } from "@/lib/smart-trips";
import { duration, fmt, sessionsOn, type Plan, type PlannedStop, type Priority, type TripStop } from "@/lib/trip-plan";
import { VEHICLES } from "@/lib/vehicles";
import { PlacePicker } from "./place-picker";
import { RouteMap, type MapPoint } from "./route-map";
import { api, areaCls, btnPrimary, btnQuiet, Field, inputCls } from "./ui";

type Mode = "admin" | "agency";
type PlanResult = {
  stops: TripStop[]; plan: Plan; source: "google" | "estimate"; fees: { included: number; onSite: number }; total: number;
  suggestedTransport: { total: number; city: string } | null; packing: string[];
  alternatives: { label: string; returnAt: number; fits: boolean; stops: TripStop[]; extendHours?: number }[];
};
type TripMeta = { id: string; ref: string; status: string; token: string; version: number; sentAt: string | null; viewedAt: string | null; acceptedAt: string | null; changeRequest: string | null; bookingReference: string | null; agencyId: string | null; commissionPercent: number; isTemplate: boolean };
type Version = { version: number; note: string | null; createdBy: string | null; createdAt: string };
type Attraction = AttractionView & { usedIn: number };

export const STATUS_LABEL: Record<string, [string, string]> = {
  draft: ["Draft", "bg-slate-100 text-slate-700"], pricing: ["Waiting for price", "bg-violet-100 text-violet-800"], sent: ["Sent", "bg-sky-100 text-sky-800"],
  changes_requested: ["Changes requested", "bg-amber-100 text-amber-800"], accepted: ["Accepted · paid", "bg-emerald-100 text-emerald-800"], cancelled: ["Cancelled", "bg-red-100 text-red-700"],
};
const PRIORITY: Record<Priority, [string, string]> = { fixed: ["Fixed", "bg-[#211726] text-white"], must: ["Must do", "bg-orange-100 text-[#C96100]"], nice: ["Nice to have", "bg-slate-100 text-slate-600"] };
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const uid = () => crypto.randomUUID().slice(0, 8);
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export const blankTrip = (): TripInput => ({
  title: "", area: "", tripDate: null, startTime: "08:00", pickupText: "", pickupLat: null, pickupLng: null, endText: null, endLat: null, endLng: null,
  durationHours: 8, adults: 2, children: 0, bags: 2, vehicle: "comfort_suv", language: "en", customerName: null, customerEmail: null, customerPhone: null,
  notes: null, stops: [], transportPrice: 0, discount: 0, isTemplate: false, templateName: null,
});

export function TripWorkspace({ mode, tripId, initialTemplate = false }: { mode: Mode; tripId?: string; initialTemplate?: boolean }) {
  const base = mode === "admin" ? "/api/admin" : "/api/agency";
  const home = mode === "admin" ? "/admin/trips" : "/agency/trips";
  const router = useRouter();
  const [draft, setDraft] = useState<TripInput | null>(tripId ? null : { ...blankTrip(), isTemplate: initialTemplate });
  const [meta, setMeta] = useState<TripMeta | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [contacts, setContacts] = useState<Record<string, SupplierRow>>({});
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [picker, setPicker] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [sameEnd, setSameEnd] = useState(true);

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      api<{ attractions: Attraction[] }>(`${base}/attractions`, "GET"),
      tripId ? api<{ trip: TripMeta; input: TripInput; versions: Version[]; supplierContacts: Record<string, SupplierRow> }>(`${base}/trips/${tripId}`, "GET") : null,
    ]);
    setAttractions(a.attractions.filter((x) => x.status === "active"));
    if (t) { setDraft(t.input); setMeta(t.trip); setVersions(t.versions); setContacts(t.supplierContacts ?? {}); setSameEnd(t.input.endLat == null); setDirty(false); }
  }, [base, tripId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);

  const update = (patch: Partial<TripInput>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true); };
  const setStops = (stops: TripStop[]) => update({ stops: stops as TripInput["stops"] });
  const patchStop = (id: string, patch: Partial<TripStop>) => draft && setStops(draft.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) as TripStop[]);

  // Re-plan (road times, checks, price) a moment after each change.
  const seq = useRef(0);
  const runPlan = useCallback(async (d: TripInput, arrange = false) => {
    if (!d.title.trim()) d = { ...d, title: "Untitled trip" };
    const n = ++seq.current;
    setPlanning(true);
    try {
      const r = await api<PlanResult>(`${base}/trips/plan`, "POST", { ...d, ...(arrange ? { arrange: true } : {}) });
      if (n !== seq.current) return;
      setResult(r);
      if (arrange) { setDraft((cur) => (cur ? { ...cur, stops: r.stops as TripInput["stops"] } : cur)); setDirty(true); setNotice("Stops arranged around the fixed sessions."); }
    } catch (e) { if (n === seq.current) setError((e as Error).message); }
    finally { if (n === seq.current) setPlanning(false); }
  }, [base]);
  const planKey = draft ? JSON.stringify({ ...draft, customerName: 0, customerEmail: 0, customerPhone: 0, notes: 0, title: 0, templateName: 0 }) : "";
  useEffect(() => {
    if (!draft) return;
    const t = window.setTimeout(() => void runPlan(draft), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, runPlan]);

  async function save(silent = false) {
    if (!draft) return null;
    if (!draft.title.trim()) { setError("Give the trip a name first."); return null; }
    setSaving(true); setError("");
    try {
      const r = await api<{ id: string; ref: string }>(`${base}/trips`, "POST", { ...draft, id: tripId ?? draft.id, endText: sameEnd ? null : draft.endText, endLat: sameEnd ? null : draft.endLat, endLng: sameEnd ? null : draft.endLng });
      setDirty(false);
      if (!silent) setNotice("Saved.");
      if (!tripId) { router.replace(`${home}/${r.id}`); return r.id; }
      await load();
      return r.id;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setSaving(false); }
  }
  async function action(name: string, extra: Record<string, unknown> = {}) {
    setError(""); setNotice("");
    const id = tripId ?? (await save(true));
    if (!id) return null;
    if (dirty && tripId) await save(true);
    try {
      const r = await api<Record<string, unknown>>(`${base}/trips/${id}`, "POST", { action: name, ...extra });
      return r;
    } catch (e) { setError((e as Error).message); return null; }
  }

  const plannedById = useMemo(() => Object.fromEntries((result?.plan.stops ?? []).map((s) => [s.id, s])), [result]) as Record<string, PlannedStop>;
  const byId = useMemo(() => Object.fromEntries(attractions.map((a) => [a.id, a])), [attractions]);
  const errors = (result?.plan.problems ?? []).filter((p) => p.level === "error");
  const warnings = (result?.plan.problems ?? []).filter((p) => p.level === "warning");
  const locked = meta?.status === "accepted";

  const points: MapPoint[] = useMemo(() => {
    if (!draft) return [];
    const pts: MapPoint[] = [];
    if (draft.pickupLat != null && draft.pickupLng != null) pts.push({ id: "pickup", lat: draft.pickupLat, lng: draft.pickupLng, label: "P", title: `Pickup · ${draft.pickupText}`, kind: "pickup" });
    let n = 0;
    for (const s of draft.stops) if (s.lat != null && s.lng != null) pts.push({ id: s.id, lat: s.lat, lng: s.lng, label: s.skipped ? "–" : String(++n), title: s.name, kind: "stop", muted: s.skipped });
    if (!sameEnd && draft.endLat != null && draft.endLng != null) pts.push({ id: "end", lat: draft.endLat, lng: draft.endLng, label: "E", title: `End · ${draft.endText}`, kind: "end" });
    else if (draft.pickupLat != null && draft.pickupLng != null && draft.stops.length) pts.push({ id: "return", lat: draft.pickupLat, lng: draft.pickupLng, label: "P", title: "Back to pickup", kind: "end" });
    return pts;
  }, [draft, sameEnd]);

  if (!draft) return <main className="grid min-h-[60vh] place-items-center">{error ? <p className="text-red-600">{error}</p> : <LoaderCircle className="animate-spin text-slate-400" />}</main>;

  const vehicle = VEHICLES[draft.vehicle as keyof typeof VEHICLES];
  const commission = meta?.agencyId ? Math.round(((result?.total ?? 0) * (meta.commissionPercent || 0)) / 100) : 0;

  function moveStop(id: string, to: number) {
    if (!draft) return;
    const list = [...draft.stops]; const from = list.findIndex((s) => s.id === id);
    if (from < 0 || to < 0 || to >= list.length) return;
    const [item] = list.splice(from, 1); list.splice(to, 0, item);
    setStops(list as TripStop[]);
  }
  function addAttraction(a: Attraction, programId: string | null, session: string | null, priority: Priority) {
    const program = a.programs.find((p) => p.id === programId);
    const stop: TripStop = { id: uid(), kind: "attraction", name: a.customerName || a.name, attractionId: a.id, programId: program?.id, sessionTime: session ?? undefined,
      lat: a.latitude, lng: a.longitude, durationMin: program?.durationMin ?? a.durationMin, priority: session ? "fixed" : priority };
    setStops([...(draft!.stops as TripStop[]), stop]);
    if (!draft!.area && a.area) update({ area: a.area });
    setPicker(false);
  }

  return <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
    {/* Header */}
    <div className="flex flex-wrap items-center gap-3">
      <Link href={home} className="grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-[#C96100]" aria-label="All trips"><ArrowLeft size={18} /></Link>
      <input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder={draft.isTemplate ? "Template name, e.g. Phuket highlights day" : "Trip name, e.g. Phuket private day trip"} className="h-11 min-w-[220px] flex-1 rounded-xl border border-transparent bg-transparent px-2 text-[24px] font-black tracking-[-.03em] outline-none hover:border-slate-200 focus:border-[#FF8A05] focus:bg-white" aria-label="Trip name" />
      {meta && <span className="text-[13px] font-semibold text-slate-500">{meta.ref}</span>}
      {meta && !meta.isTemplate && <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_LABEL[meta.status]?.[1]}`}>{STATUS_LABEL[meta.status]?.[0] ?? meta.status}</span>}
      {draft.isTemplate && <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[13px] font-semibold text-violet-800">Quick quote template</span>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void runPlan(draft, true)} disabled={locked || planning || draft.stops.length < 2} className={btnQuiet} title="Order stops around fixed sessions with the least driving"><Wand2 size={16} />Auto-arrange</button>
        <button type="button" onClick={() => void save()} disabled={locked || saving} className={btnQuiet}>{saving && <LoaderCircle size={15} className="animate-spin" />}{dirty ? "Save" : "Saved"}</button>
        {!draft.isTemplate && <button type="button" onClick={() => setSendOpen(true)} disabled={locked} className={btnPrimary}><Send size={16} />{meta?.sentAt ? "Send update" : "Send to customer"}</button>}
      </div>
    </div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`mt-2 text-[14px] font-semibold ${error ? "text-red-600" : "text-emerald-700"}`}>{error || notice}</p>}
    {meta?.changeRequest && meta.status === "changes_requested" && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[14px]"><p className="font-bold text-amber-900">The customer asked for changes</p><p className="mt-1 whitespace-pre-line text-amber-900">“{meta.changeRequest}”</p></div>}
    {locked && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[14px] text-emerald-900">Paid{meta?.bookingReference ? <> as booking <Link className="font-bold underline" href={`/admin/bookings?q=${meta.bookingReference}`}>{meta.bookingReference}</Link></> : ""}. The plan is locked; duplicate it to make another.</div>}

    <section className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      {/* Left: setup + itinerary */}
      <div className="grid content-start gap-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-[16px] font-bold">Trip</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {!draft.isTemplate && <Field label="Date"><input type="date" min={bangkokToday()} value={draft.tripDate ?? ""} onChange={(e) => update({ tripDate: e.target.value || null })} className={inputCls} /></Field>}
            <Field label="Pickup time"><input type="time" value={draft.startTime} onChange={(e) => update({ startTime: e.target.value })} className={inputCls} /></Field>
            <Field label="Hours"><input type="number" min={1} max={16} value={draft.durationHours} onChange={(e) => update({ durationHours: Math.min(16, Math.max(1, Math.round(Number(e.target.value) || 1))) })} className={inputCls} /></Field>
            <Field label="Adults"><input type="number" min={1} max={30} value={draft.adults} onChange={(e) => update({ adults: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className={inputCls} /></Field>
            <Field label="Children"><input type="number" min={0} max={20} value={draft.children} onChange={(e) => update({ children: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={inputCls} /></Field>
            <Field label="Bags"><input type="number" min={0} max={30} value={draft.bags} onChange={(e) => update({ bags: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={inputCls} /></Field>
          </div>
          <Field label="Pickup" className="mt-3" hint={draft.pickupLat == null && draft.pickupText ? "Pick a suggestion so drive times can be worked out" : undefined}><PlacePicker value={draft.pickupText} onChange={(p) => update({ pickupText: p.text, ...(p.lat != null ? { pickupLat: p.lat, pickupLng: p.lng } : {}) })} className={inputCls} placeholder="Hotel or address" /></Field>
          <label className="mt-2 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={sameEnd} onChange={(e) => { setSameEnd(e.target.checked); setDirty(true); }} className="size-4 accent-[#FF8A05]" />End where the trip starts</label>
          {!sameEnd && <Field label="Drop-off at the end" className="mt-2"><PlacePicker value={draft.endText ?? ""} onChange={(p) => update({ endText: p.text, ...(p.lat != null ? { endLat: p.lat, endLng: p.lng } : {}) })} className={inputCls} placeholder="Hotel, airport or address" /></Field>}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Vehicle" hint={vehicle ? `Seats ${vehicle.passengers}, ${vehicle.bags} bags` : undefined}><select value={draft.vehicle} onChange={(e) => update({ vehicle: e.target.value })} className={inputCls}>{Object.entries(VEHICLES).map(([id, v]) => <option key={id} value={id}>{v.name}</option>)}</select></Field>
            <Field label="Customer language"><select value={draft.language} onChange={(e) => update({ language: e.target.value as TripInput["language"] })} className={inputCls}><option value="en">English</option><option value="th">Thai</option><option value="zh">Chinese</option></select></Field>
          </div>
          {!draft.isTemplate && <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Customer name"><input value={draft.customerName ?? ""} onChange={(e) => update({ customerName: e.target.value })} className={inputCls} /></Field>
            <Field label="Email"><input type="email" value={draft.customerEmail ?? ""} onChange={(e) => update({ customerEmail: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input value={draft.customerPhone ?? ""} onChange={(e) => update({ customerPhone: e.target.value })} className={inputCls} /></Field>
          </div>}
          <Field label="Customer request / notes" className="mt-3" hint="Shown to the customer on the itinerary"><textarea value={draft.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} className={areaCls} /></Field>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-[16px] font-bold">Itinerary</h2>{planning && <LoaderCircle size={16} className="animate-spin text-slate-400" />}</div>
          <ol className="mt-3 grid gap-2">
            <li className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-[14px]"><span className="grid size-7 place-items-center rounded-full bg-[#211726] text-[12px] font-bold text-white">P</span><span className="font-bold tabular-nums">{draft.startTime}</span><span className="truncate">Pickup · {draft.pickupText || "set the pickup"}</span></li>
            {draft.stops.map((s, index) => {
              const p = plannedById[s.id]; const a = s.attractionId ? byId[s.attractionId] : undefined;
              const program = a?.programs.find((x) => x.id === s.programId);
              const sessions = a && program ? sessionsOn({ ...a, latitude: a.latitude, longitude: a.longitude } as never, program, draft.tripDate ?? null) : [];
              const contact = s.attractionId ? contacts[s.attractionId] : undefined;
              const hasError = p?.problems.some((x) => x.level === "error");
              return <li key={s.id} draggable={!locked} onDragStart={() => setDragId(s.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) moveStop(dragId, index); setDragId(null); }}
                onClick={() => setSelected(s.id)} className={`rounded-2xl border p-3 text-[14px] transition ${selected === s.id ? "border-[#FF8A05] ring-2 ring-orange-100" : hasError ? "border-red-200 bg-red-50/40" : "border-slate-200"} ${s.skipped ? "opacity-55" : ""}`}>
                {p && p.travelMin > 0 && <p className="-mt-1 mb-2 text-[12px] text-slate-500">↓ {duration(p.travelMin)} drive{p.wait > 0 ? ` · ${duration(p.wait)} wait` : ""}</p>}
                <div className="flex items-start gap-2">
                  <GripVertical size={16} className="mt-1 shrink-0 cursor-grab text-slate-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold tabular-nums">{p ? `${fmt(p.start)}–${fmt(p.end)}` : "—"}</span>
                      <span className="truncate font-semibold">{s.kind === "meal" && <Utensils size={13} className="mr-1 inline" />}{s.name}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY[s.priority][1]}`}>{s.sessionTime ? "Fixed session" : PRIORITY[s.priority][0]}</span>
                      {s.locked && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">Locked</span>}
                      {s.skipped && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">Skipped</span>}
                    </div>
                    {p && s.sessionTime && <p className="text-[12px] text-slate-500">Arrive {fmt(p.arrival)} · check in by {fmt(Number(s.sessionTime.slice(0, 2)) * 60 + Number(s.sessionTime.slice(3)) - (program?.arrivalBufferMin ?? a?.arrivalBufferMin ?? 0))}{program ? ` · ${program.name}` : ""}</p>}
                    {a?.openTime && <p className="text-[12px] text-slate-500">Open {a.openTime}–{a.closeTime}{a.lastEntry ? `, last entry ${a.lastEntry}` : ""}{(program?.bookingRequired || a.bookingRequired) ? " · booking required" : ""}</p>}
                    {contact && mode === "admin" && <p className="text-[12px] text-slate-500"><Phone size={11} className="mr-1 inline" />{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}{contact.lineId ? ` · LINE ${contact.lineId}` : ""}</p>}
                    {p?.problems.map((x, i) => <p key={i} className={`mt-1 text-[12px] font-semibold ${x.level === "error" ? "text-red-700" : "text-amber-700"}`}>{x.message}</p>)}
                    {selected === s.id && !locked && <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {program && <Field label="Session"><select value={s.sessionTime ?? ""} onChange={(e) => patchStop(s.id, { sessionTime: e.target.value || undefined, priority: e.target.value ? "fixed" : "must" })} className={inputCls}><option value="">Any time</option>{[...new Set([...sessions, ...(s.sessionTime ? [s.sessionTime] : [])])].map((t) => <option key={t} value={t}>{t}{sessions.includes(t) ? "" : " (not on this date)"}</option>)}</select></Field>}
                        {!s.sessionTime && <Field label="Priority"><select value={s.priority} onChange={(e) => patchStop(s.id, { priority: e.target.value as Priority })} className={inputCls}><option value="must">Must do</option><option value="nice">Nice to have</option><option value="fixed">Fixed</option></select></Field>}
                        <Field label="Minutes"><input type="number" min={0} max={720} value={s.durationMin} onChange={(e) => patchStop(s.id, { durationMin: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={inputCls} /></Field>
                        {s.kind === "meal" && <><Field label="Not before"><input type="time" value={s.windowStart ?? ""} onChange={(e) => patchStop(s.id, { windowStart: e.target.value || undefined })} className={inputCls} /></Field><Field label="Not after"><input type="time" value={s.windowEnd ?? ""} onChange={(e) => patchStop(s.id, { windowEnd: e.target.value || undefined })} className={inputCls} /></Field></>}
                      </div>
                      {s.kind !== "attraction" && <Field label="Place"><PlacePicker value={s.name} onChange={(pp) => patchStop(s.id, { name: pp.text.split(",")[0] || pp.text, ...(pp.lat != null ? { lat: pp.lat, lng: pp.lng } : {}) })} className={inputCls} placeholder="Restaurant or place" /></Field>}
                      <Field label="Note for the customer"><input value={s.note ?? ""} onChange={(e) => patchStop(s.id, { note: e.target.value || undefined })} className={inputCls} /></Field>
                    </div>}
                  </div>
                  {!locked && <div className="-mr-1 -mt-1 flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => moveStop(s.id, index - 1)} disabled={index === 0} aria-label="Move up" className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => moveStop(s.id, index + 1)} disabled={index === draft.stops.length - 1} aria-label="Move down" className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14} /></button>
                    <button type="button" onClick={() => patchStop(s.id, { locked: !s.locked })} aria-label={s.locked ? "Unlock position" : "Lock position"} title={s.locked ? "Unlock" : "Lock this stop's position"} className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100">{s.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                    <button type="button" onClick={() => patchStop(s.id, { skipped: !s.skipped })} aria-label={s.skipped ? "Include" : "Skip"} title={s.skipped ? "Include again" : "Skip (keep in the list)"} className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100">{s.skipped ? <Plus size={14} /> : <X size={14} />}</button>
                    <button type="button" onClick={() => setStops((draft.stops as TripStop[]).filter((x) => x.id !== s.id))} aria-label="Remove" className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>}
                </div>
              </li>;
            })}
            {result && draft.stops.length > 0 && <li className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-[14px]"><span className="grid size-7 place-items-center rounded-full bg-[#211726] text-[12px] font-bold text-white">{sameEnd ? "P" : "E"}</span><span className="font-bold tabular-nums">{fmt(result.plan.returnAt)}</span><span className="truncate">{sameEnd ? "Back at pickup" : `Drop-off · ${draft.endText}`}{result.plan.returnTravel ? ` (${duration(result.plan.returnTravel)} drive)` : ""}</span></li>}
          </ol>
          {!locked && <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPicker(true)} className={btnPrimary}><Plus size={16} />Add attraction</button>
            <button type="button" onClick={() => setStops([...(draft.stops as TripStop[]), { id: uid(), kind: "meal", name: "Lunch", durationMin: 60, priority: "must", windowStart: "11:30", windowEnd: "13:30" }])} className={btnQuiet}><Utensils size={15} />Meal break</button>
            <button type="button" onClick={() => { const id = uid(); setStops([...(draft.stops as TripStop[]), { id, kind: "custom", name: "New stop", durationMin: 30, priority: "must" }]); setSelected(id); }} className={btnQuiet}><MapPin size={15} />Custom stop</button>
          </div>}
        </section>
      </div>

      {/* Right: map, checks, price */}
      <div className="grid content-start gap-4 lg:sticky lg:top-4">
        <RouteMap points={points} selected={selected} onSelect={setSelected} />
        {result && <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Driving", duration(result.plan.totalDrive)], ["Activities", duration(result.plan.totalActivity)], ["Waiting", duration(result.plan.totalWait)], ["Back at", `${fmt(result.plan.returnAt)} / ${fmt(result.plan.endLimit)}`]].map(([k, v]) =>
            <div key={k} className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[12px] text-slate-500">{k}</p><p className={`text-[17px] font-bold ${k === "Back at" && result.plan.overBy > 0 ? "text-red-600" : ""}`}>{v}</p></div>)}
          <p className="col-span-full text-[12px] text-slate-500">{result.source === "google" ? "Drive times from Google Maps with expected traffic." : "Drive times are estimated from distance (Google Maps unavailable)."}</p>
        </section>}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-[16px] font-bold">{errors.length ? <AlertTriangle size={18} className="text-red-600" /> : <CheckCircle2 size={18} className="text-emerald-600" />}Checks</h2>
          {!result && <p className="mt-2 text-[14px] text-slate-500">Add a pickup and stops to check the plan.</p>}
          {result && !errors.length && !warnings.length && <p className="mt-2 text-[14px] text-emerald-700">Fixed sessions are protected, places are open, and the trip fits its hours.</p>}
          <ul className="mt-2 grid gap-1.5 text-[13px]">{[...errors, ...warnings].map((p, i) => <li key={i} className={p.level === "error" ? "text-red-700" : "text-amber-700"}>{p.level === "error" ? "✕" : "!"} {p.message}</li>)}</ul>
          {result && result.alternatives.length > 0 && !locked && <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
            <p className="flex items-center gap-1.5 text-[14px] font-bold"><Sparkles size={15} className="text-[#D96F00]" />Ways to fit the trip</p>
            {result.alternatives.map((alt, i) => <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px]">
              <span><b>{String.fromCharCode(65 + i)}.</b> {alt.label} · {alt.extendHours ? `trip ${draft.durationHours + alt.extendHours} hours` : `back ${fmt(alt.returnAt)}`}{!alt.fits && " (still over)"}</span>
              <button type="button" onClick={() => { if (alt.extendHours) update({ durationHours: Math.min(16, draft.durationHours + alt.extendHours) }); else setStops(alt.stops); }} className="font-semibold text-[#C96100] hover:underline">Apply</button>
            </div>)}
          </div>}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-[16px] font-bold">Price</h2>
          <div className="mt-3 grid gap-2 text-[14px]">
            <div className="flex items-end gap-2">
              <Field label="Car and driver" className="flex-1" hint={result?.suggestedTransport ? `Hourly rate for ${result.suggestedTransport.city}: ${thb(result.suggestedTransport.total)}` : "No hourly rate for this pickup city; set a price."}>
                <input type="number" min={0} value={draft.transportPrice} disabled={mode === "agency"} onChange={(e) => update({ transportPrice: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={inputCls} /></Field>
              {result?.suggestedTransport && mode === "admin" && draft.transportPrice !== result.suggestedTransport.total && <button type="button" onClick={() => update({ transportPrice: result.suggestedTransport!.total })} className={`${btnQuiet} mb-5`}>Use</button>}
            </div>
            <div className="flex justify-between"><span className="text-slate-600">Tickets included</span><span>{thb(result?.fees.included ?? 0)}</span></div>
            {mode === "admin" && <Field label="Discount"><input type="number" min={0} value={draft.discount} onChange={(e) => update({ discount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={inputCls} /></Field>}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-[17px] font-bold"><span>Total</span><span>{thb(result?.total ?? draft.transportPrice)}</span></div>
            {(result?.fees.onSite ?? 0) > 0 && <p className="text-[13px] text-slate-500">Paid on the day by the customer: {thb(result!.fees.onSite)} in entrance fees.</p>}
            {meta?.agencyId && <p className="text-[13px] font-semibold text-emerald-700">Agency commission {meta.commissionPercent}%: {thb(commission)} when the customer pays.</p>}
          </div>
        </section>

        {result && result.packing.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-[16px] font-bold">Packing list for the customer</h2><ul className="mt-2 grid gap-1 text-[14px] text-slate-700">{result.packing.map((p) => <li key={p}>• {p}</li>)}</ul></section>}

        {meta && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-[16px] font-bold">Sharing and versions</h2>
          {meta.sentAt && <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
            <a href={`/itinerary/${meta.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#C96100] hover:underline"><ExternalLink size={14} />Customer page</a>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(`${location.origin}/itinerary/${meta.token}`); setNotice("Link copied."); }} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#C96100]"><Copy size={14} />Copy link</button>
            <span className="text-slate-500">{meta.viewedAt ? `Opened ${new Date(meta.viewedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "Not opened yet"}</span>
          </div>}
          <ul className="mt-2 grid gap-1 text-[13px] text-slate-600">{versions.map((v) => <li key={v.version}><b>Version {v.version}</b> · {v.note} · {new Date(v.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}{v.createdBy ? ` · ${v.createdBy}` : ""}</li>)}{!versions.length && <li>Nothing sent yet.</li>}</ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={async () => { const r = await action("duplicate"); if (r?.id) router.push(`${home}/${r.id}`); }} className={btnQuiet}><Copy size={15} />Duplicate</button>
            {!meta.isTemplate && <button type="button" onClick={async () => { const r = await action("template"); if (r?.id) router.push(`${home}/${r.id}`); }} className={btnQuiet}>Save as template</button>}
            {mode === "agency" && draft.transportPrice === 0 && meta.status !== "pricing" && <button type="button" onClick={async () => { if (await action("ask_price")) { setNotice("Waydidi has been asked for a price."); await load(); } }} className={btnQuiet}>Ask Waydidi for a price</button>}
            {meta.isTemplate ? <button type="button" onClick={async () => { if (confirm("Delete this template?") && await action("delete")) router.push(`${home}?view=templates`); }} className={`${btnQuiet} text-red-600`}>Delete template</button>
              : meta.status !== "cancelled" && meta.status !== "accepted" ? <button type="button" onClick={async () => { if (confirm("Cancel this trip? The customer link will stop working.") && await action("cancel")) await load(); }} className={`${btnQuiet} text-red-600`}>Cancel trip</button>
              : meta.status === "cancelled" ? <button type="button" onClick={async () => { if (await action("reopen")) await load(); }} className={btnQuiet}>Reopen</button> : null}
          </div>
        </section>}
      </div>
    </section>

    {picker && <AttractionPicker attractions={attractions} date={draft.tripDate ?? null} area={draft.area} onClose={() => setPicker(false)} onAdd={addAttraction} />}
    {sendOpen && <SendDialog hasEmail={Boolean(draft.customerEmail)} errors={errors.length} onClose={() => setSendOpen(false)} onSend={async (note, notify) => {
      const r = await action("send", { note, notify });
      if (!r) return;
      setSendOpen(false);
      const warn = (r.warnings as string[] | undefined)?.length ? ` Note: ${(r.warnings as string[]).length} check(s) still failing.` : "";
      setNotice(`Version ${r.version} is live.${r.delivery === "sent" ? " Emailed to the customer." : r.delivery === "failed" ? " The email could not be sent; copy the link instead." : ""}${warn}`);
      await load();
    }} />}
  </main>;
}

function AttractionPicker({ attractions, date, area, onClose, onAdd }: { attractions: Attraction[]; date: string | null; area: string; onClose: () => void; onAdd: (a: Attraction, programId: string | null, session: string | null, priority: Priority) => void }) {
  const [q, setQ] = useState("");
  const [onlyArea, setOnlyArea] = useState(Boolean(area));
  const [chosen, setChosen] = useState<Attraction | null>(null);
  const [programId, setProgramId] = useState<string>("");
  const [session, setSession] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("must");
  const list = attractions.filter((a) => (!onlyArea || !area || a.area === area) && `${a.name} ${a.customerName ?? ""} ${a.category} ${a.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const program = chosen?.programs.find((p) => p.id === programId);
  const sessions = chosen && program ? sessionsOn(chosen as never, program, date) : [];
  return <div role="dialog" aria-modal="true" aria-labelledby="pick-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 id="pick-title" className="text-[20px] font-bold">{chosen ? chosen.customerName || chosen.name : "Add attraction"}</h2><button type="button" onClick={chosen ? () => setChosen(null) : onClose} aria-label={chosen ? "Back" : "Close"} className="rounded-full p-1.5 hover:bg-slate-100">{chosen ? <ArrowLeft size={20} /> : <X size={20} />}</button></div>
      {!chosen ? <>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search attractions" className={`${inputCls} mt-3`} />
        {area && <label className="mt-2 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={onlyArea} onChange={(e) => setOnlyArea(e.target.checked)} className="size-4 accent-[#FF8A05]" />Only {area}</label>}
        <ul className="mt-3 grid gap-2 overflow-y-auto">
          {list.map((a) => <li key={a.id}><button type="button" onClick={() => { setChosen(a); setProgramId(a.programs[0]?.id ?? ""); setSession(""); }} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left hover:border-[#FF8A05]">
            {a.coverImage ? <img src={a.coverImage} alt="" className="size-12 rounded-lg object-cover" /> : <span className="grid size-12 place-items-center rounded-lg bg-orange-50 text-[#D96F00]"><MapPin size={18} /></span>}
            <span className="min-w-0 flex-1"><span className="block font-semibold">{a.customerName || a.name}</span><span className="block text-[12px] text-slate-500">{a.area} · {a.category} · {a.openTime ? `${a.openTime}–${a.closeTime}` : "any time"}{a.programs.length ? ` · ${a.programs.length} program${a.programs.length > 1 ? "s" : ""}` : ""}{a.latitude == null ? " · no map location" : ""}</span></span>
          </button></li>)}
          {!list.length && <li className="py-8 text-center text-[14px] text-slate-500">No attractions match. Add them under Attractions.</li>}
        </ul>
      </> : <div className="mt-3 grid gap-3">
        {chosen.description && <p className="text-[14px] text-slate-600">{chosen.description}</p>}
        {chosen.programs.length > 0 && <Field label="Program"><select value={programId} onChange={(e) => { setProgramId(e.target.value); setSession(""); }} className={inputCls}><option value="">General visit ({chosen.durationMin} min)</option>{chosen.programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.durationMin} min)</option>)}</select></Field>}
        {program && program.sessions.length > 0 && <Field label="Session" hint={date ? (sessions.length ? `Sessions on ${date}` : "No sessions on this date") : "Set the trip date to see that day's sessions"}>
          <div className="flex flex-wrap gap-2">{(date ? sessions : program.sessions.map((s) => s.time)).map((t) => <button key={t} type="button" onClick={() => setSession(session === t ? "" : t)} className={`h-10 rounded-xl border px-4 text-[14px] font-semibold ${session === t ? "border-[#FF8A05] bg-orange-50 text-[#C96100]" : "border-slate-200"}`}>{t}</button>)}</div></Field>}
        {!session && <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls}><option value="must">Must do (customer asked)</option><option value="nice">Nice to have (if time allows)</option><option value="fixed">Fixed (already booked)</option></select></Field>}
        {session && <p className="rounded-xl bg-orange-50 p-3 text-[13px] text-[#9A4D00]">Fixed session at {session}: the plan will arrive {program?.arrivalBufferMin ?? chosen.arrivalBufferMin} min early and arrange other stops around it.</p>}
        <button type="button" onClick={() => onAdd(chosen, programId || null, session || null, priority)} className={btnPrimary}><Plus size={16} />Add to trip</button>
      </div>}
    </div>
  </div>;
}

function SendDialog({ hasEmail, errors, onClose, onSend }: { hasEmail: boolean; errors: number; onClose: () => void; onSend: (note: string, notify: boolean) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(hasEmail);
  const [busy, setBusy] = useState(false);
  return <div role="dialog" aria-modal="true" aria-labelledby="send-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSend(note, notify); setBusy(false); }} className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <h2 id="send-title" className="text-[20px] font-bold">Send to the customer</h2>
      <p className="mt-1 text-[14px] text-slate-600">This saves a new version the customer sees on their itinerary page. Earlier versions are kept.</p>
      {errors > 0 && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[13px] font-semibold text-red-700">{errors} check(s) are failing. You can still send, but fix them first if you can.</p>}
      <Field label="What changed (for the version history)" className="mt-3"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added Promthep Cape" className={inputCls} /></Field>
      <label className="mt-3 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={notify} disabled={!hasEmail} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-[#FF8A05]" />Email the link to the customer{!hasEmail && " (add an email first)"}</label>
      <div className="mt-4 flex gap-2"><button type="button" onClick={onClose} className={`${btnQuiet} flex-1`}>Back</button><button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>{busy && <LoaderCircle size={16} className="animate-spin" />}Send</button></div>
    </form>
  </div>;
}

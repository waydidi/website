"use client";

import { CalendarRange, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";

type Season = { id: string; name: string; startsOn: string; endsOn: string; repeatsYearly: boolean; adjustmentType: "percent" | "fixed"; adjustment: number; service: "all" | "transfer" | "hourly"; areaIds: string | null; reason: string | null; active: boolean };
type Draft = Omit<Season, "areaIds" | "reason" | "id"> & { id?: string; areaIds: string[]; reason: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const blank: Draft = { name: "", startsOn: "", endsOn: "", repeatsYearly: true, adjustmentType: "percent", adjustment: 10, service: "all", areaIds: [], reason: "", active: true };
const fmtDay = (d: string) => { const [m, day] = d.slice(-5).split("-").map(Number); return `${day} ${MONTHS[m - 1]}${d.length > 5 ? ` ${d.slice(0, 4)}` : ""}`; };
const effect = (s: Pick<Season, "adjustmentType" | "adjustment">) => s.adjustmentType === "percent" ? `${s.adjustment > 0 ? "+" : ""}${s.adjustment}%` : `${s.adjustment > 0 ? "+" : ""}${s.adjustment.toLocaleString()} THB`;

/** Which days of the next 12 months a season covers, as [startFraction, endFraction] of the strip. */
function spans(s: Season, from: Date) {
  const out: [number, number][] = [];
  let open: number | null = null;
  for (let i = 0; i <= 365; i += 1) {
    const d = new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10);
    const day = d.slice(5);
    const on = s.repeatsYearly ? (s.startsOn <= s.endsOn ? day >= s.startsOn && day <= s.endsOn : day >= s.startsOn || day <= s.endsOn) : d >= s.startsOn && d <= s.endsOn;
    if (on && open === null) open = i;
    if ((!on || i === 365) && open !== null) { out.push([open / 365, (on ? i + 1 : i) / 365]); open = null; }
  }
  return out;
}

export default function SeasonsWorkspace() {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/seasons", { cache: "no-store" }).catch(() => null);
    const out = res?.ok ? await res.json() as { seasons: Season[]; areas: { id: string; name: string }[] } : { seasons: [], areas: [] };
    setSeasons(out.seasons); setAreas(out.areas);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
  useEffect(() => { void load(); }, [load]);

  async function save(next: Draft) {
    setBusy(true); setError("");
    const res = await fetch("/api/admin/seasons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...next, areaIds: next.areaIds.length ? next.areaIds : null }) }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) { setError(out?.error ?? "The season couldn't be saved."); return false; }
    await load(); return true;
  }
  const toDraft = (s: Season): Draft => ({ ...s, areaIds: (() => { try { return JSON.parse(s.areaIds ?? "[]") as string[]; } catch { return []; } })(), reason: s.reason ?? "" });
  async function remove(s: Season) {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    await fetch("/api/admin/seasons", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) });
    await load();
  }

  // Today in Bangkok (UTC+7), so the strip starts on the right day between midnight and 7am.
  const [today] = useState(() => new Date(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) + "T00:00:00Z"));
  const monthMarks = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1)); return { label: MONTHS[d.getUTCMonth()], at: Math.max(0, (d.getTime() - today.getTime()) / 86400000 / 365) }; });
  const input = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-brand";

  return <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-[28px] font-black tracking-[-.03em]">Seasons</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-slate-500">Holidays and travel seasons that change driver supply. The pickup date picks the season; when seasons overlap, only the highest adjustment applies. Used for website prices and LINE price suggestions.</p></div>
      <button type="button" onClick={() => { setError(""); setDraft({ ...blank }); }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong"><Plus size={17} />Add season</button>
    </div>

    {/* Next 12 months at a glance */}
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-[15px] font-bold"><CalendarRange size={17} className="text-brand-text" />Next 12 months</h2>
      <div className="mt-3 grid grid-cols-[150px_1fr] gap-3 sm:grid-cols-[220px_1fr]"><span /><div className="relative h-5 text-[11px] text-slate-400">{monthMarks.map((m) => <span key={m.label + m.at} className="absolute" style={{ left: `${m.at * 100}%` }}>{m.label}</span>)}</div></div>
      <div className="grid gap-1.5">
        {(seasons ?? []).filter((s) => s.active).map((s) => <div key={s.id} className="grid grid-cols-[150px_1fr] items-center gap-3 text-[12px] sm:grid-cols-[220px_1fr]">
          <span className="truncate font-medium text-slate-700">{s.name} <span className="text-slate-400">{effect(s)}</span></span>
          <div className="relative h-4 rounded-full bg-slate-100">{spans(s, today).map(([a, b]) => <span key={a} className="group absolute inset-y-0" style={{ left: `${a * 100}%`, width: `${Math.max(0.6, (b - a) * 100)}%` }}>
            <button type="button" onClick={() => setPicked(picked === `${s.id}:${a}` ? null : `${s.id}:${a}`)} onBlur={() => setPicked(null)} aria-label={`${s.name}: ${fmtDay(s.startsOn)} – ${fmtDay(s.endsOn)}, ${effect(s)}`} className={`block h-full w-full min-w-2 cursor-pointer rounded-full transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${s.adjustment > 0 ? "bg-brand" : s.adjustment < 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
            {/* Hover (mouse) or tap (phone) shows the holiday, its dates and the price change */}
            <span role="tooltip" className={`pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[240px] rounded-xl bg-night px-3 py-2 text-[12px] leading-snug text-white shadow-lg ${a > 0.6 ? "right-0" : "left-0"} ${picked === `${s.id}:${a}` ? "block" : "hidden group-hover:block"}`}>
              <b className="block text-[13px]">{s.name}</b>{fmtDay(s.startsOn)} – {fmtDay(s.endsOn)}{s.repeatsYearly ? " (every year)" : ""}<br />Price change: <b className={s.adjustment > 0 ? "text-[#FFB15C]" : s.adjustment < 0 ? "text-emerald-300" : ""}>{effect(s)}</b>
            </span>
          </span>)}</div>
        </div>)}
      </div>
    </section>

    <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600"><tr>{["Season", "Dates", "Adjustment", "Applies to", "Status", ""].map((h) => <th key={h} className="h-12 px-4 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {seasons === null && <tr><td colSpan={6} className="py-12 text-center"><LoaderCircle className="mx-auto animate-spin text-slate-400" /></td></tr>}
          {seasons?.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-slate-500">No seasons yet.</td></tr>}
          {seasons?.map((s) => <tr key={s.id} className="align-middle">
            <td className="px-4 py-3"><p className="font-medium text-slate-900">{s.name}</p>{s.reason && <p className="text-[12px] text-slate-500">{s.reason}</p>}</td>
            <td className="whitespace-nowrap px-4 py-3">{fmtDay(s.startsOn)} – {fmtDay(s.endsOn)}<p className="text-[12px] text-slate-500">{s.repeatsYearly ? "Every year" : "One-off"}</p></td>
            <td className={`px-4 py-3 font-semibold ${s.adjustment > 0 ? "text-brand-darker" : s.adjustment < 0 ? "text-emerald-700" : "text-slate-500"}`}>{effect(s)}</td>
            <td className="px-4 py-3 text-slate-700">{s.service === "all" ? "Transfer & hourly" : s.service === "transfer" ? "Transfer" : "By the hour"}{s.areaIds && <p className="text-[12px] text-slate-500">Selected areas</p>}</td>
            <td className="px-4 py-3"><button type="button" onClick={() => void save({ ...toDraft(s), active: !s.active })} className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium ${s.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{s.active ? "Active" : "Paused"}</button></td>
            <td className="px-4 py-3"><div className="flex justify-end gap-1">
              <button type="button" onClick={() => { setError(""); setDraft(toDraft(s)); }} aria-label={`Edit ${s.name}`} className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-orange-50 hover:text-brand-darker"><Pencil size={16} /></button>
              <button type="button" onClick={() => void remove(s)} aria-label={`Delete ${s.name}`} className="grid size-9 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
            </div></td>
          </tr>)}
        </tbody>
      </table></div>
    </section>

    {draft && <Modal open onClose={() => setDraft(null)} locked={busy} sheet overlayClassName="z-50 bg-black/40" asChild>
      <form onSubmit={async (e) => { e.preventDefault(); if (await save(draft)) setDraft(null); }} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between"><ModalTitle id="season-title" className="text-[20px] font-bold">{draft.id ? "Edit season" : "Add season"}</ModalTitle><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold">Name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Songkran" className={input} /></label>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={draft.repeatsYearly} onChange={(e) => setDraft({ ...draft, repeatsYearly: e.target.checked, startsOn: "", endsOn: "" })} className="size-4 accent-brand" />Same dates every year</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-[13px] font-semibold">Starts{draft.repeatsYearly
              ? <input required pattern="\d{2}-\d{2}" value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} placeholder="MM-DD e.g. 04-11" className={input} />
              : <input required type="date" value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} className={input} />}</label>
            <label className="grid gap-1 text-[13px] font-semibold">Ends{draft.repeatsYearly
              ? <input required pattern="\d{2}-\d{2}" value={draft.endsOn} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} placeholder="MM-DD e.g. 04-17" className={input} />
              : <input required type="date" value={draft.endsOn} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} className={input} />}</label>
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <label className="grid gap-1 text-[13px] font-semibold">Adjustment<input required type="number" step={1} value={draft.adjustment} onChange={(e) => setDraft({ ...draft, adjustment: Math.round(Number(e.target.value)) })} className={input} /></label>
            <label className="grid gap-1 text-[13px] font-semibold">Type<select value={draft.adjustmentType} onChange={(e) => setDraft({ ...draft, adjustmentType: e.target.value as Draft["adjustmentType"] })} className={input}><option value="percent">% of price</option><option value="fixed">THB per trip</option></select></label>
          </div>
          <p className="-mt-1 text-[12px] text-slate-500">Use a negative number for a low-season discount.</p>
          <label className="grid gap-1 text-[13px] font-semibold">Applies to<select value={draft.service} onChange={(e) => setDraft({ ...draft, service: e.target.value as Draft["service"] })} className={input}><option value="all">Transfer and By the hour</option><option value="transfer">Transfer only</option><option value="hourly">By the hour only</option></select></label>
          {areas.length > 0 && <fieldset className="grid gap-1 text-[13px] font-semibold"><legend>Fare areas <span className="font-normal text-slate-500">(none ticked = every area)</span></legend>
            <div className="mt-1 flex flex-wrap gap-2">{areas.map((a) => { const on = draft.areaIds.includes(a.id); return <button key={a.id} type="button" onClick={() => setDraft({ ...draft, areaIds: on ? draft.areaIds.filter((x) => x !== a.id) : [...draft.areaIds, a.id] })} className={`rounded-full border px-3 py-1 text-[13px] font-medium ${on ? "border-brand bg-orange-50 text-brand-darker" : "border-slate-200 text-slate-600"}`}>{a.name}</button>; })}</div></fieldset>}
          <label className="grid gap-1 text-[13px] font-semibold">Why (optional)<input value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="e.g. Drivers travel home for the holiday" className={input} /></label>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-4 accent-brand" />Active</label>
        </div>
        {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Save season</button>
      </form>
    </Modal>}
  </main>;
}

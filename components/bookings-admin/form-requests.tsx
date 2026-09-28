"use client";

import { Check, Copy, LoaderCircle, Luggage, Send, Trash2, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewBookingButton, type NewBookingPrefill } from "@/components/bookings-admin/new-booking";
import type { FormAnswers, FormPrefill, FormService } from "@/lib/booking-form";
import { VEHICLES } from "@/lib/vehicles";

type FormRow = {
  token: string; serviceType: FormService; note: string | null; status: "waiting" | "submitted" | "booked";
  answers: FormAnswers | null; prefill: FormPrefill | null; agencyId: string | null; agencyName: string | null; bookingReference: string | null; createdAt: string; expiresAt: string; submittedAt: string | null;
};

const SERVICE_NAMES: Record<FormService, string> = { transfer: "Transfer", hourly: "By the hour", tour: "Tour" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

function prefillFrom(form: FormRow): NewBookingPrefill {
  const a = form.answers;
  if (!a) return { serviceType: form.serviceType };
  const words = a.name.trim().split(/\s+/);
  return {
    serviceType: form.serviceType, customerName: words.length > 1 ? words.slice(0, -1).join(" ") : a.name, customerSurname: words.length > 1 ? words[words.length - 1] : "", customerPhone: a.phone, customerEmail: a.email,
    pickup: a.pickup, flightNumber: a.flightNumber ?? "", dropoff: a.dropoff ?? "", bookedHours: a.hours ?? 4,
    pickupDate: a.date, pickupTime: a.time,
    returnOn: Boolean(a.returnTrip), returnDate: a.returnDate ?? "", returnTime: a.returnTime ?? "",
    passengers: a.passengers, luggage: a.luggage, vehicle: a.vehicle,
    childSeats: a.childSeats, exchangeStop: a.exchangeStop, ferryPeople: a.ferryPeople,
    specialRequests: form.note ?? "",
    fare: form.prefill?.price !== undefined ? String(form.prefill.price) : "",
    agencyId: form.agencyId ?? "",
  };
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[14px] font-medium hover:border-[#FF8A05]">
    {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}
  </button>;
}

// "27/09/2026 — 01:15 am"
function dateTime(date: string, time: string) {
  const [y, m, d] = date.split("-");
  const [h = 0, min = 0] = time.split(":").map(Number);
  const t = time ? ` — ${String(h % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}` : "";
  return y ? `${d}/${m}/${y}${t}` : time;
}

// "Form links": send customers a private step-by-step form, then turn answers into a booking.
export function FormRequestsButton({ openForm, openSignal, openKind, onWaiting }: { service?: FormService; openKind?: FormService; openForm?: string; openSignal?: number; onWaiting?: (n: number) => void }) {
  const [open, setOpen] = useState(Boolean(openForm));
  const [forms, setForms] = useState<FormRow[] | null>(null);
  // No service is picked up front: choosing one is required before a link can be made.
  const [kind, setKind] = useState<FormService | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState("");
  const [expanded, setExpanded] = useState("");
  const [origin, setOrigin] = useState("");
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
  const [agencyId, setAgencyId] = useState("");
  const [showPreset, setShowPreset] = useState(false);
  const [preset, setPreset] = useState({ pickup: "", dropoff: "", hours: "", date: "", time: "", vehicle: "", price: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/forms", { cache: "no-store" }).catch(() => null);
    const out = res?.ok ? await res.json() as { forms: FormRow[]; agencies: { id: string; name: string }[] } : { forms: [], agencies: [] };
    setForms(out.forms); setAgencies(out.agencies ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the site origin for share links
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const waitingAnswers = forms?.filter((f) => f.status === "submitted").length ?? 0;
  useEffect(() => { onWaiting?.(waitingAnswers); }, [onWaiting, waitingAnswers]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open when the Create menu asks
    if (openSignal) { setOpen(true); setFresh(""); if (openKind) setKind(openKind); void load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal, load]);

  async function create() {
    if (!kind) { setError("Choose a service first."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceType: kind, note, agencyId: agencyId || undefined, prefill: showPreset ? {
        pickup: preset.pickup.trim() || undefined, dropoff: kind === "hourly" ? undefined : preset.dropoff.trim() || undefined,
        hours: kind === "hourly" && preset.hours ? Number(preset.hours) : undefined, date: preset.date || undefined, time: preset.time || undefined,
        vehicle: preset.vehicle || undefined, price: preset.price !== "" ? Math.max(0, Math.round(Number(preset.price))) : undefined,
      } : undefined }) });
      const out = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !out.token) throw new Error(out.error ?? "The link could not be created.");
      setFresh(out.token); setNote(""); setPreset({ pickup: "", dropoff: "", hours: "", date: "", time: "", vehicle: "", price: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "The link could not be created."); }
    finally { setBusy(false); }
  }

  async function remove(token: string) {
    await fetch("/api/admin/forms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, remove: true }) }).catch(() => null);
    await load();
  }

  const link = (token: string) => `${origin}/f/${token}`;

  return <>
    {openSignal === undefined && <button type="button" onClick={() => { setOpen(true); setFresh(""); void load(); }} className="relative inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-800 hover:border-[#FF8A05]">
      <Send size={16} />Form links
      {waitingAnswers > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-bold text-white">{waitingAnswers}</span>}
    </button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[92dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 text-slate-900 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 text-left">
          <div><DialogTitle className="text-[24px] font-semibold">Form links</DialogTitle><DialogDescription className="sr-only">Create and manage customer form links.</DialogDescription></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-orange-50"><X size={20} /></button>
        </DialogHeader>

        <section className="mt-2 grid gap-3 rounded-2xl bg-slate-50 p-4">
          <fieldset>
            <legend className="text-[13px] font-medium text-slate-600">Service <span className="text-red-600">*</span></legend>
            <div role="radiogroup" aria-required="true" className="mt-1 grid grid-cols-3 gap-2">
              {(Object.keys(SERVICE_NAMES) as FormService[]).map((id) => <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`flex h-11 items-center justify-center whitespace-nowrap rounded-xl border px-1 text-[14px] font-semibold ${kind === id ? "border-[#FF8A05] bg-orange-50 text-[#C96100]" : "border-slate-200 bg-white text-slate-700 hover:border-[#FF8A05]"}`}>{SERVICE_NAMES[id]}</button>)}
            </div>
          </fieldset>
          <label className="block text-[13px] font-medium text-slate-600">Note for yourself (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Agency Sunny Tours, special price" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
          {agencies.length > 0 && <label className="block text-[13px] font-medium text-slate-600">For agency (optional)<select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]">
            <option value="">No agency, direct customer</option>
            {agencies.map((ag) => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
          </select></label>}
          <label className="flex items-center gap-2 text-[14px] font-medium text-slate-700"><input type="checkbox" checked={showPreset} onChange={(e) => setShowPreset(e.target.checked)} className="size-4 accent-[#FF8A05]" />Pre-fill trip details and price (the customer can&apos;t change them)</label>
          {showPreset && <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[13px] font-medium text-slate-600">Pickup<input value={preset.pickup} onChange={(e) => setPreset({ ...preset, pickup: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
            {kind === "hourly"
              ? <label className="block text-[13px] font-medium text-slate-600">Hours<input type="number" min={1} max={24} value={preset.hours} onChange={(e) => setPreset({ ...preset, hours: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
              : <label className="block text-[13px] font-medium text-slate-600">{kind === "tour" ? "Tour" : "Drop-off"}<input value={preset.dropoff} onChange={(e) => setPreset({ ...preset, dropoff: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>}
            <label className="block text-[13px] font-medium text-slate-600">Date<input type="date" value={preset.date} onChange={(e) => setPreset({ ...preset, date: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
            <label className="block text-[13px] font-medium text-slate-600">Time<input type="time" value={preset.time} onChange={(e) => setPreset({ ...preset, time: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
            <label className="block text-[13px] font-medium text-slate-600">Car<select value={preset.vehicle} onChange={(e) => setPreset({ ...preset, vehicle: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]"><option value="">Customer chooses</option>{Object.entries(VEHICLES).map(([id, v]) => <option key={id} value={id}>{v.name}</option>)}</select></label>
            <label className="block text-[13px] font-medium text-slate-600">Price (THB, shown to customer)<input type="number" min={0} inputMode="numeric" value={preset.price} onChange={(e) => setPreset({ ...preset, price: e.target.value })} placeholder="Leave empty to set later" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
            <p className="text-[12px] text-slate-500 sm:col-span-2">Leave any box empty and the customer fills it in.</p>
          </div>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void create()} disabled={busy || !kind} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FF8A05] px-5 font-semibold text-white hover:bg-[#E67900] disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Create link</button>
            {error && <span className="text-[14px] text-red-600">{error}</span>}
          </div>
          {fresh && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
            <span className="min-w-0 flex-1 truncate font-mono text-[14px]">{link(fresh)}</span>
            <CopyButton url={link(fresh)} />
            <a href={`https://wa.me/?text=${encodeURIComponent(`Please fill in your ride details here: ${link(fresh)}`)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full bg-[#25D366] px-3 text-[14px] font-semibold text-white">WhatsApp</a>
          </div>}
        </section>

        <ul className="mt-4 divide-y divide-slate-100">
          {forms === null && <li className="py-6 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></li>}
          {forms?.length === 0 && <li className="py-6 text-center text-slate-500">No form links yet.</li>}
          {forms?.map((form) => {
            const expired = form.status === "waiting" && form.expiresAt < new Date().toISOString();
            const a = form.answers;
            const open = expanded === form.token;
            const details: [string, React.ReactNode][] = a ? [
              ["Passengers & luggage", <span key="pl" className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><UsersRound size={15} />{a.passengers}</span><span className="inline-flex items-center gap-1"><Luggage size={15} />{a.luggage}</span></span>],
              ["Vehicle", VEHICLES[a.vehicle as keyof typeof VEHICLES]?.name ?? a.vehicle],
              ["Date & time", dateTime(a.date, a.time)],
              ["From", a.pickup],
              ...(a.dropoff ? [["To", a.dropoff] as [string, string]] : a.hours ? [["Hours", `${a.hours} hours`] as [string, string]] : []),
              ...(a.returnTrip ? [["Return", dateTime(a.returnDate ?? "", a.returnTime ?? "")] as [string, string]] : []),
              ["Price", form.prefill?.price !== undefined ? `THB ${form.prefill.price.toLocaleString()}` : "Not set"],
            ] : [];
            return <li key={form.token} className="grid gap-1.5 py-3">
              <div role={a ? "button" : undefined} tabIndex={a ? 0 : undefined} aria-expanded={a ? open : undefined} onClick={() => a && setExpanded(open ? "" : form.token)} onKeyDown={(e) => { if (a && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setExpanded(open ? "" : form.token); } }} className={`flex items-center gap-2 ${a ? "cursor-pointer" : ""}`}>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold ${form.status === "submitted" ? "bg-orange-100 text-orange-800" : form.status === "booked" ? "bg-emerald-100 text-emerald-800" : expired ? "bg-slate-200 text-slate-600" : "bg-sky-100 text-sky-800"}`}>
                  {form.status === "submitted" ? "Answers in" : form.status === "booked" ? "Booked" : expired ? "Expired" : "Waiting"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{a?.name ?? SERVICE_NAMES[form.serviceType]}</span>
                {form.status === "booked" && form.bookingReference
                  ? <Link href={`/admin/journeys/${form.bookingReference}`} onClick={(e) => e.stopPropagation()} className="shrink-0 font-mono text-[13px] font-semibold text-[#D96F00] hover:underline">{form.bookingReference}</Link>
                  : <span className="shrink-0 text-[12px] text-slate-400">{when(form.submittedAt ?? form.createdAt)}</span>}
              </div>
              {open && <dl className="mt-1 grid gap-1.5 rounded-xl bg-slate-50 p-3 text-[13px]">
                {form.agencyName && <div className="flex justify-between gap-3"><dt className="text-slate-500">Agency</dt><dd className="text-right font-medium">{form.agencyName}</dd></div>}
                {details.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
                {form.note && <div className="flex justify-between gap-3"><dt className="text-slate-500">Note</dt><dd className="text-right font-medium">{form.note}</dd></div>}
              </dl>}
              {form.status !== "booked" && <div className="flex flex-wrap items-center gap-2">
                {form.status === "waiting" && !expired && <CopyButton url={link(form.token)} />}
                {form.status === "submitted" && <NewBookingButton service={form.serviceType} prefill={prefillFrom(form)} formToken={form.token} trigger="Create booking" autoOpen={form.token === openForm} />}
                {<button type="button" onClick={() => void remove(form.token)} aria-label="Delete form link" className="ml-auto grid size-9 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
              </div>}
            </li>;
          })}
        </ul>
      </DialogContent>
    </Dialog>
  </>;
}

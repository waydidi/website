"use client";

import { Check, Copy, LoaderCircle, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewBookingButton, type NewBookingPrefill } from "@/components/bookings-admin/new-booking";
import type { FormAnswers, FormService } from "@/lib/booking-form";
import { VEHICLES } from "@/lib/vehicles";

type FormRow = {
  token: string; serviceType: FormService; note: string | null; status: "waiting" | "submitted" | "booked";
  answers: FormAnswers | null; bookingReference: string | null; createdAt: string; expiresAt: string; submittedAt: string | null;
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
  };
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[14px] font-medium hover:border-[#FF8A05]">
    {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}
  </button>;
}

// "Form links": send customers a private step-by-step form, then turn answers into a booking.
export function FormRequestsButton({ service }: { service: FormService }) {
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [kind, setKind] = useState<FormService>(service);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState("");
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/forms", { cache: "no-store" }).catch(() => null);
    const out = res?.ok ? await res.json() as { forms: FormRow[] } : { forms: [] };
    setForms(out.forms);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the site origin for share links
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const waitingAnswers = forms?.filter((f) => f.status === "submitted").length ?? 0;

  async function create() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceType: kind, note }) });
      const out = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !out.token) throw new Error(out.error ?? "The link could not be created.");
      setFresh(out.token); setNote("");
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
    <button type="button" onClick={() => { setOpen(true); setFresh(""); void load(); }} className="relative inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-800 hover:border-[#FF8A05]">
      <Send size={16} />Form links
      {waitingAnswers > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-bold text-white">{waitingAnswers}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[92dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 text-slate-900 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 text-left">
          <div><DialogTitle className="text-[24px] font-semibold">Form links</DialogTitle><DialogDescription>Send a customer a link to fill in their ride details step by step. Their answers arrive here, ready to book.</DialogDescription></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-orange-50"><X size={20} /></button>
        </DialogHeader>

        <section className="mt-2 grid gap-3 rounded-2xl bg-slate-50 p-4">
          <div role="tablist" aria-label="Service" className="inline-flex w-fit rounded-xl bg-[#E8EAEE] p-1">
            {(Object.keys(SERVICE_NAMES) as FormService[]).map((id) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)} className={`h-9 rounded-lg px-4 text-[14px] ${kind === id ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{SERVICE_NAMES[id]}</button>)}
          </div>
          <label className="block text-[13px] font-medium text-slate-600">Note for yourself (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Agency Sunny Tours, special price" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void create()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FF8A05] px-5 font-semibold text-white hover:bg-[#E67900] disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Create link</button>
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
            return <li key={form.token} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${form.status === "submitted" ? "bg-orange-100 text-orange-800" : form.status === "booked" ? "bg-emerald-100 text-emerald-800" : expired ? "bg-slate-200 text-slate-600" : "bg-sky-100 text-sky-800"}`}>
                  {form.status === "submitted" ? "Answers in" : form.status === "booked" ? "Booked" : expired ? "Expired" : "Waiting"}
                </span>
                <span className="text-[14px] font-medium">{a?.name ?? SERVICE_NAMES[form.serviceType]}</span>
                {form.note && <span className="text-[13px] text-slate-500">· {form.note}</span>}
                <span className="ml-auto text-[12px] text-slate-400">{when(form.submittedAt ?? form.createdAt)}</span>
              </div>
              {a && <p className="text-[13px] text-slate-600">{a.pickup}{a.dropoff ? ` → ${a.dropoff}` : a.hours ? ` · ${a.hours} hours` : ""} · {a.date} {a.time} · {a.passengers} pax, {a.luggage} bags · {VEHICLES[a.vehicle as keyof typeof VEHICLES]?.name ?? a.vehicle}{a.returnTrip ? ` · return ${a.returnDate} ${a.returnTime}` : ""}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {form.status === "waiting" && !expired && <CopyButton url={link(form.token)} />}
                {form.status === "submitted" && <NewBookingButton service={form.serviceType} prefill={prefillFrom(form)} formToken={form.token} trigger="Create booking" />}
                {form.status === "booked" && form.bookingReference && <Link href={`/admin/journeys/${form.bookingReference}`} className="text-[14px] font-medium text-[#D96F00] hover:underline">{form.bookingReference}</Link>}
                {form.status !== "booked" && <button type="button" onClick={() => void remove(form.token)} aria-label="Delete form link" className="ml-auto grid size-9 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
              </div>
            </li>;
          })}
        </ul>
      </DialogContent>
    </Dialog>
  </>;
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Baby, CircleHelp, Info, Minus, NotebookPen, Plane, Plus, Package, UsersRound } from "lucide-react";
import { FlightLookup } from "@/components/flight-lookup";
import type { ReviewFieldErrors } from "@/lib/booking-review";
import type { Booking } from "./booking-flow";

type Traveller = { id: string; name: string; surname: string; email: string | null; phone: string | null; notes: string | null };

// Dial codes offered next to the mobile number; Thailand first.
const DIAL_CODES = [
  ["🇹🇭", "+66"], ["🇬🇧", "+44"], ["🇺🇸", "+1"], ["🇦🇺", "+61"], ["🇸🇬", "+65"], ["🇨🇳", "+86"], ["🇭🇰", "+852"],
  ["🇲🇾", "+60"], ["🇮🇳", "+91"], ["🇯🇵", "+81"], ["🇰🇷", "+82"], ["🇩🇪", "+49"], ["🇫🇷", "+33"], ["🇷🇺", "+7"],
] as const;

function splitPhone(phone: string) {
  const match = phone.trim().match(/^(\+\d{1,4})\s*(.*)$/);
  const code = match && DIAL_CODES.some(([, c]) => c === match[1]) ? match[1] : "+66";
  return { code, local: match && code === match[1] ? match[2] : phone.replace(/^\+\d{1,4}\s*/, "") };
}

const field = (invalid: boolean) =>
  `h-14 w-full rounded-xl px-4 text-base text-[#1C1C1C] outline-none placeholder:text-[#8A8A8A] focus:ring-2 focus:ring-brand ${invalid ? "bg-red-50 ring-1 ring-red-300" : "bg-[#F4F4F2]"}`;

function OptionPill({ icon: Icon, label, open, onClick }: { icon: typeof Plus; label: string; open: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-expanded={open} className={`inline-flex min-h-12 items-center gap-3 rounded-full border px-5 text-[16px] text-[#1C1C1C] transition ${open ? "border-brand bg-orange-50" : "border-[#D9D9D9] bg-white hover:border-[#BDBDBD]"}`}>
    {open ? <Icon size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{label}
  </button>;
}

// Step 1 after choosing a car: trip extras and the lead passenger (Transfeero style).
export function BookingDetailsStep({ booking, change, fieldErrors, savedTravellers, applyTraveller, total, onBack, onContinue }: {
  booking: Booking;
  change: <K extends keyof Booking>(key: K, value: Booking[K]) => void;
  fieldErrors: ReviewFieldErrors;
  savedTravellers: Traveller[];
  applyTraveller: (traveller: Traveller) => void;
  total: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const airport = /airport|\bBKK\b|\bDMK\b|\bHKT\b|\bCNX\b/i.test(booking.pickup);
  const [open, setOpen] = useState({
    flight: Boolean(booking.flightNumber),
    seats: booking.childSeats > 0,
    notes: Boolean(booking.specialRequests),
    luggage: booking.oversizedLuggage,
  });
  const toggle = (key: keyof typeof open) => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const phone = splitPhone(booking.phone);
  const [signHelp, setSignHelp] = useState(false);
  // The bar is portalled to <body>: the step fades in with a transform, which
  // would otherwise pin a "fixed" bar to the step instead of the screen.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return <section className="bg-[#F6F5F2] pb-40">
    <div className="mx-auto max-w-[640px] px-4 py-6 sm:py-10">
      <div className="rounded-[20px] border border-[#E6E4DF] bg-white px-5 py-6 sm:px-7">
        <h2 className="text-[26px] font-semibold tracking-[-.02em] text-[#1C1C1C]">Booking details</h2>
        <div className="mt-5 flex min-w-0 flex-col items-start gap-3">
          <OptionPill icon={Plane} label={airport ? "Add flight number" : "Add flight or train number"} open={open.flight} onClick={() => toggle("flight")} />
          {open.flight && <div className="w-full">
            <input value={booking.flightNumber} onChange={(e) => change("flightNumber", e.target.value)} maxLength={30} placeholder="Flight number, e.g. TG 123" className={`${field(false)} uppercase placeholder:normal-case`} autoFocus />
            <p className="mt-2 text-sm text-[#6B6B6B]">We use it to follow arrival changes and the right terminal.</p>
            <FlightLookup flightNumber={booking.flightNumber} flightDate={booking.date} />
          </div>}
          <OptionPill icon={Baby} label="Need a child or booster seat?" open={open.seats} onClick={() => toggle("seats")} />
          {open.seats && <div className="flex w-full items-center justify-between rounded-xl bg-[#F4F4F2] px-4 py-3">
            <span className="text-[16px] text-[#1C1C1C]">Child or booster seats</span>
            <span className="flex items-center gap-4">
              <button type="button" aria-label="Fewer seats" disabled={booking.childSeats <= 0} onClick={() => change("childSeats", Math.max(0, booking.childSeats - 1))} className="grid size-9 place-items-center rounded-full border border-[#D9D9D9] bg-white disabled:opacity-40"><Minus size={16} /></button>
              <span className="w-4 text-center text-[17px] font-semibold" aria-live="polite">{booking.childSeats}</span>
              <button type="button" aria-label="More seats" disabled={booking.childSeats >= 4} onClick={() => change("childSeats", Math.min(4, booking.childSeats + 1))} className="grid size-9 place-items-center rounded-full border border-[#D9D9D9] bg-white disabled:opacity-40"><Plus size={16} /></button>
            </span>
          </div>}
          <OptionPill icon={NotebookPen} label="Add notes for the driver" open={open.notes} onClick={() => toggle("notes")} />
          {open.notes && <textarea value={booking.specialRequests} onChange={(e) => change("specialRequests", e.target.value)} maxLength={500} rows={3} placeholder="Accessibility needs, meeting point or other requests" className="w-full resize-none rounded-xl bg-[#F4F4F2] px-4 py-3 text-base outline-none placeholder:text-[#8A8A8A] focus:ring-2 focus:ring-brand" />}
          <OptionPill icon={Package} label="Oversized luggage?" open={open.luggage} onClick={() => { toggle("luggage"); change("oversizedLuggage", !open.luggage); }} />
          {open.luggage && <p className="text-sm text-[#6B6B6B]">Golf bags, surfboards, bikes or unusually large items. We&apos;ll confirm the vehicle fits.</p>}
        </div>

        <hr className="my-7 border-[#E6E4DF]" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[26px] font-semibold tracking-[-.02em] text-[#1C1C1C]">Lead passenger</h2>
          {savedTravellers.length > 0 && <label className="flex items-center gap-2 text-sm text-[#4A4A4A]">
            <UsersRound size={17} aria-hidden="true" /><span className="sr-only">Saved traveller</span>
            <select defaultValue="" onChange={(e) => { const t = savedTravellers.find((x) => x.id === e.target.value); if (t) applyTraveller(t); }} className="rounded-full border border-[#D9D9D9] bg-white px-3 py-2 text-base outline-none focus:border-brand">
              <option value="" disabled>Saved travellers…</option>
              {savedTravellers.map((t) => <option key={t.id} value={t.id}>{t.name} {t.surname}</option>)}
            </select>
          </label>}
        </div>
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4">
          {([["name", "First name", "given-name", "text"], ["surname", "Last name", "family-name", "text"], ["email", "Email address", "email", "email"]] as const).map(([key, label, auto, type]) => <div key={key}>
            <label className="sr-only" htmlFor={`lead-${key}`}>{label}</label>
            <input id={`lead-${key}`} data-booking-field={key} type={type} autoComplete={auto} value={booking[key]} onChange={(e) => change(key, e.target.value)} placeholder={label} aria-invalid={Boolean(fieldErrors[key])} className={field(Boolean(fieldErrors[key]))} />
            {fieldErrors[key] && <p className="mt-1.5 text-sm font-medium text-red-700">{fieldErrors[key]}</p>}
          </div>)}
          <div>
            <div className={`rounded-xl px-4 pb-2 pt-2.5 ${fieldErrors.phone ? "bg-red-50 ring-1 ring-red-300" : "bg-[#F4F4F2]"} focus-within:ring-2 focus-within:ring-brand`}>
              <label htmlFor="lead-phone" className="block text-[13px] text-[#6B6B6B]">Mobile number (WhatsApp if possible)</label>
              <div className="mt-0.5 flex items-center gap-2">
                <label className="sr-only" htmlFor="lead-dial">Country code</label>
                <select id="lead-dial" value={phone.code} onChange={(e) => change("phone", `${e.target.value} ${phone.local}`.trim())} className="bg-transparent py-1 text-[17px] outline-none">
                  {DIAL_CODES.map(([flag, code]) => <option key={code} value={code}>{flag} {code}</option>)}
                </select>
                <input id="lead-phone" data-booking-field="phone" type="tel" autoComplete="tel-national" inputMode="tel" value={phone.local} onChange={(e) => change("phone", `${phone.code} ${e.target.value}`.trim())} placeholder="81 234 5678" size={1} aria-invalid={Boolean(fieldErrors.phone)} className="w-0 min-w-0 flex-1 bg-transparent py-1 text-[17px] outline-none placeholder:text-[#8A8A8A]" />
              </div>
            </div>
            {fieldErrors.phone && <p className="mt-1.5 text-sm font-medium text-red-700">{fieldErrors.phone}</p>}
          </div>
          <div>
            <div className="relative">
              <label className="sr-only" htmlFor="lead-sign">Meet &amp; Greet sign name</label>
              <input id="lead-sign" value={booking.pickupSign} onChange={(e) => change("pickupSign", e.target.value)} maxLength={80} placeholder="Meet & Greet name (optional)" className={`${field(false)} pr-12`} />
              <button type="button" onClick={() => setSignHelp(!signHelp)} aria-expanded={signHelp} aria-label="About Meet & Greet" className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[#6B6B6B]"><CircleHelp size={20} /></button>
            </div>
            {signHelp && <p className="mt-2 flex gap-2 text-sm text-[#6B6B6B]"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />The name your driver shows on the sign at the meeting point. Leave empty to use the lead passenger&apos;s name.</p>}
          </div>
        </div>
      </div>
    </div>

    {/* Bottom bar, Transfeero style: total, back and Continue. */}
    {mounted && createPortal(
    <div className="font-home fixed inset-x-0 bottom-0 z-40 border-t border-[#E6E4DF] bg-white px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(33_20_10/0.06)]">
      <div className="mx-auto max-w-[640px]">
        <p className="flex items-baseline gap-2"><span className="text-[15px] text-[#4A4A4A]">Total</span><strong className="text-[20px] font-semibold text-[#1C1C1C]">{total}</strong></p>
        <div className="mt-2.5 flex gap-3">
          <button type="button" onClick={onBack} aria-label="Back to cars" className="grid h-[52px] w-16 shrink-0 place-items-center rounded-xl border-2 border-[#1C1C1C] text-[#1C1C1C]"><ArrowLeft size={20} /></button>
          <button type="button" onClick={onContinue} className="h-[52px] flex-1 rounded-xl bg-brand text-[17px] font-semibold text-white transition hover:bg-brand-hover">Continue</button>
        </div>
      </div>
    </div>,
      document.body,
    )}
  </section>;
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, CircleHelp, Info, NotebookPen, Plane, Plus, UsersRound, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReviewFieldErrors } from "@/lib/booking-review";
import type { Booking } from "./booking-flow";

type Traveller = { id: string; name: string; surname: string; email: string | null; phone: string | null; notes: string | null };

// Dial codes offered next to the mobile number; Thailand first. Flags are
// round SVGs in /public/flags, as in the homepage language switcher.
const DIAL_CODES = [
  ["th", "+66", "Thailand"], ["gb", "+44", "United Kingdom"], ["us", "+1", "United States"], ["au", "+61", "Australia"],
  ["sg", "+65", "Singapore"], ["cn", "+86", "China"], ["hk", "+852", "Hong Kong"], ["my", "+60", "Malaysia"],
  ["in", "+91", "India"], ["jp", "+81", "Japan"], ["kr", "+82", "South Korea"], ["de", "+49", "Germany"],
  ["fr", "+33", "France"], ["ru", "+7", "Russia"],
] as const;

function Flag({ country, size }: { country: string; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG, as in the locale picker
  return <img src={`/flags/${country}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover ring-1 ring-black/10" />;
}

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
    notes: Boolean(booking.specialRequests),
  });
  const toggle = (key: keyof typeof open) => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const phone = splitPhone(booking.phone);
  const [signHelp, setSignHelp] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
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
          </div>}
          <OptionPill icon={NotebookPen} label="Add notes for the driver" open={open.notes} onClick={() => toggle("notes")} />
          {open.notes && <textarea value={booking.specialRequests} onChange={(e) => change("specialRequests", e.target.value)} maxLength={500} rows={3} placeholder="Accessibility needs, meeting point or other requests" className="w-full resize-none rounded-xl bg-[#F4F4F2] px-4 py-3 text-base outline-none placeholder:text-[#8A8A8A] focus:ring-2 focus:ring-brand" />}
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
                <button type="button" onClick={() => setDialOpen(true)} aria-label={`Country code ${phone.code}. Change`} className="flex shrink-0 items-center gap-1.5 py-1">
                  <Flag country={DIAL_CODES.find(([, c]) => c === phone.code)?.[0] ?? "th"} size={26} />
                  <ChevronDown size={16} className="text-[#6B6B6B]" aria-hidden="true" />
                </button>
                <span className="shrink-0 text-[17px] text-[#1C1C1C]">{phone.code}</span>
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
          {/* Tax invoice: ticking the box reveals the billing fields. */}
          <div className="rounded-xl border border-[#E6E6E6] p-4">
            <label className="flex cursor-pointer items-center gap-3 text-[16px] text-[#1C1C1C]">
              <input type="checkbox" checked={Boolean(booking.taxInvoice)} onChange={(e) => change("taxInvoice", e.target.checked)} className="size-5 shrink-0 accent-[#FF8A05]" />
              Request a tax invoice
            </label>
            {booking.taxInvoice && <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
              <p className="text-sm text-[#6B6B6B]">Your tax invoice will be issued with these details.</p>
              {([["taxName", "Company or full name", "organization"], ["taxId", "Tax ID (13 digits)", "off"]] as const).map(([key, label, auto]) => <div key={key}>
                <label className="sr-only" htmlFor={`tax-${key}`}>{label}</label>
                <input id={`tax-${key}`} data-booking-field={key} autoComplete={auto} inputMode={key === "taxId" ? "numeric" : undefined} maxLength={key === "taxId" ? 17 : 200} value={booking[key] ?? ""} onChange={(e) => change(key, e.target.value)} placeholder={label} aria-invalid={Boolean(fieldErrors[key])} className={field(Boolean(fieldErrors[key]))} />
                {fieldErrors[key] && <p className="mt-1.5 text-sm font-medium text-red-700">{fieldErrors[key]}</p>}
              </div>)}
              <div>
                <label className="sr-only" htmlFor="tax-branch">Branch</label>
                <input id="tax-branch" value={booking.taxBranch ?? ""} onChange={(e) => change("taxBranch", e.target.value)} maxLength={60} placeholder="Branch (e.g. Head office or 00001)" className={field(false)} />
              </div>
              <div>
                <label className="sr-only" htmlFor="tax-taxAddress">Billing address</label>
                <textarea id="tax-taxAddress" data-booking-field="taxAddress" autoComplete="street-address" value={booking.taxAddress ?? ""} onChange={(e) => change("taxAddress", e.target.value)} maxLength={500} rows={3} placeholder="Billing address" aria-invalid={Boolean(fieldErrors.taxAddress)} className={`${field(Boolean(fieldErrors.taxAddress))} resize-none`} />
                {fieldErrors.taxAddress && <p className="mt-1.5 text-sm font-medium text-red-700">{fieldErrors.taxAddress}</p>}
              </div>
            </div>}
          </div>
        </div>
      </div>
    </div>

    {/* Country code sheet, styled like the homepage language picker. */}
    <DialogPrimitive.Root open={dialOpen} onOpenChange={setDialOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="font-home fixed inset-x-0 bottom-0 z-[81] flex max-h-[80dvh] flex-col rounded-t-[20px] bg-white text-[#0F294D] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
          <div className="flex items-center justify-between border-b border-[#EEF1F6] px-6 py-5">
            <DialogPrimitive.Title className="text-lg font-bold">Country code</DialogPrimitive.Title>
            <DialogPrimitive.Close className="grid size-9 place-items-center rounded-full hover:bg-slate-100" aria-label="Close"><X size={24} /></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Choose the country code for your mobile number</DialogPrimitive.Description>
          <ul className="flex-1 overflow-y-auto px-4 py-3">
            {DIAL_CODES.map(([country, code, name]) => {
              const selected = code === phone.code;
              return <li key={code}><button type="button" onClick={() => { change("phone", `${code} ${phone.local}`.trim()); setDialOpen(false); }} aria-current={selected || undefined} className={`flex min-h-14 w-full items-center gap-4 rounded-xl px-3 text-left text-base transition ${selected ? "bg-[#F5F7FA] font-medium text-[#3264FF]" : "hover:bg-[#F5F7FA]"}`}>
                <Flag country={country} size={32} /><span className="flex-1">{name}</span><span className="text-[#6B6B6B]">{code}</span>
              </button></li>;
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>

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

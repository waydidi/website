"use client";
import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingDeleteButton } from "@/components/booking-delete-button";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
import { DateField } from "@/components/booking-form/date-field";
import { PassengerField } from "@/components/booking-form/passenger-field";
import type { EditableBooking, PaymentChoice } from "@/lib/booking-edit";

// "Edit" on a booking card: a sheet from the bottom to change the date and time (and the return's), the
// car class, passengers and bags, the customer's details, flight, child seats and notes, and how it is
// paid. The price doesn't change; the driver with the job gets the updated job post.
// Deleting the booking (with the admin password) is at the bottom.
export type { EditableBooking } from "@/lib/booking-edit";
// The earliest day the picker offers: today, or the booking's own (earlier) date.
const earliest = (date: string) => { const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); return date && date < today ? date : today; };
const field = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-brand";

export function BookingEditButton({ booking }: { booking: EditableBooking }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Edit booking ${booking.reference}`} className="inline-flex h-9 items-center px-2 text-[14px] font-bold text-brand-darker underline-offset-4 hover:underline">Edit</button>
    {open && <EditSheet booking={booking} onClose={() => setOpen(false)} />}
  </>;
}

function EditSheet({ booking, onClose }: { booking: EditableBooking; onClose: () => void }) {
  const router = useRouter();
  // Older bookings may store the class's name ("Economy sedan") instead of its id.
  const vehicle = booking.vehicle in VEHICLES ? booking.vehicle : (Object.keys(VEHICLES) as VehicleId[]).find((id) => VEHICLES[id].name.toLowerCase() === booking.vehicle.toLowerCase()) ?? booking.vehicle;
  const [form, setForm] = useState({ ...booking, vehicle, returnDate: booking.returnDate ?? "", returnTime: booking.returnTime ?? "", payment: booking.payment });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | number | PaymentChoice) => setForm((f) => ({ ...f, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.reference)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: form.customerName, customerSurname: form.customerSurname, customerPhone: form.customerPhone, customerEmail: form.customerEmail, flightNumber: form.flightNumber, childSeats: Number(form.childSeats), specialRequests: form.specialRequests, pickup: form.pickup, dropoff: form.dropoff, pickupDate: form.pickupDate, pickupTime: form.pickupTime, returnDate: form.returnDate, returnTime: form.returnTime, vehicle: form.vehicle, passengers: Number(form.passengers), luggage: Number(form.luggage) }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The booking could not be saved.");
      if (form.payment && form.payment !== booking.payment) {
        const pay = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.reference)}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment: form.payment }) });
        const out = (await pay.json().catch(() => ({}))) as { error?: string };
        if (!pay.ok) { router.refresh(); throw new Error(`Details saved, but the payment wasn't changed: ${out.error ?? "please try again."}`); }
      }
      onClose(); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal open onClose={onClose} locked={busy} sheet overlayClassName="z-50 bg-black/40 sm:items-end sm:p-0" asChild>
    <div className="max-h-[90dvh] w-full max-w-lg animate-in slide-in-from-bottom overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] duration-300">
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
      <div className="flex items-center justify-between">
        <ModalTitle className="text-lg font-black">Edit</ModalTitle>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <form onSubmit={save} className="mt-4 grid gap-3 text-[14px]">
        <label className="grid gap-1 text-slate-600">From<input required value={form.pickup} onChange={(e) => set("pickup", e.target.value)} className={field} /></label>
        {booking.serviceType !== "hourly" && <label className="grid gap-1 text-slate-600">To<input required value={form.dropoff} onChange={(e) => set("dropoff", e.target.value)} className={field} /></label>}
        {/* Date and time in one, with the same picker as the booking search. */}
        <div className="grid gap-1 text-slate-600">{booking.returnDate ? "First trip" : "Date & time"}
          <DateField value={form.pickupDate} time={form.pickupTime} min={earliest(form.pickupDate)} onChange={(v) => set("pickupDate", v)} onTimeChange={(v) => set("pickupTime", v)} className={`${field} text-slate-900`} />
        </div>
        {booking.returnDate && <div className="grid gap-1 text-slate-600">Second trip
          <DateField kind="return" value={form.returnDate} time={form.returnTime} min={earliest(form.returnDate)} onChange={(v) => set("returnDate", v)} onTimeChange={(v) => set("returnTime", v)} className={`${field} text-slate-900`} />
        </div>}
        <label className="mt-1 grid gap-1 text-slate-600">Vehicle
          <select value={form.vehicle} onChange={(e) => set("vehicle", e.target.value)} className={field}>
            {(Object.keys(VEHICLES) as VehicleId[]).map((id) => <option key={id} value={id}>{VEHICLES[id].name} · up to {VEHICLES[id].passengers} people, {VEHICLES[id].bags} bags</option>)}
          </select>
        </label>
        <div className="grid gap-1 text-slate-600">Passengers & bags
          <PassengerField passengers={Number(form.passengers)} bags={Number(form.luggage)} onChange={(p, b) => setForm((f) => ({ ...f, passengers: p, luggage: b }))} />
        </div>
        <fieldset className="mt-2 grid gap-3 border-t border-slate-100 pt-3">
          <legend className="text-[13px] font-black text-slate-700">Customer</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-slate-600">Name<input required maxLength={100} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} className={field} autoComplete="off" /></label>
            <label className="grid gap-1 text-slate-600">Surname<input maxLength={100} value={form.customerSurname} onChange={(e) => set("customerSurname", e.target.value)} className={field} autoComplete="off" /></label>
          </div>
          <label className="grid gap-1 text-slate-600">Phone<input required type="tel" maxLength={40} value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} className={field} autoComplete="off" /></label>
          <label className="grid gap-1 text-slate-600">Email<input required type="email" maxLength={254} value={form.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} className={field} autoComplete="off" /></label>
        </fieldset>
        <fieldset className="grid gap-3 border-t border-slate-100 pt-3">
          <legend className="text-[13px] font-black text-slate-700">Extras</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-slate-600">Flight number<input maxLength={20} value={form.flightNumber} onChange={(e) => set("flightNumber", e.target.value.toUpperCase())} placeholder="TG 123" className={field} /></label>
            <label className="grid gap-1 text-slate-600">Child seats<select value={form.childSeats} onChange={(e) => set("childSeats", Number(e.target.value))} className={field}>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          <label className="grid gap-1 text-slate-600">Notes<textarea maxLength={500} rows={2} value={form.specialRequests} onChange={(e) => set("specialRequests", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-brand" /></label>
        </fieldset>
        {booking.payment ? <fieldset className="grid gap-2 border-t border-slate-100 pt-3">
          <legend className="text-[13px] font-black text-slate-700">Payment</legend>
          <div role="radiogroup" aria-label="Payment" className="inline-flex w-fit flex-wrap rounded-xl bg-[#E8EAEE] p-1">
            {([["paid", "Paid", "text-emerald-700"], ["cash", "Pay in cash", "text-red-600"], ["waiting", "Waiting for payment", "text-warning"]] as const).map(([v, text, tone]) => <button key={v} type="button" role="radio" aria-checked={form.payment === v} onClick={() => set("payment", v)} className={`min-h-tap rounded-lg px-3 text-[13.5px] ${form.payment === v ? `bg-white font-medium shadow-sm ${tone}` : "text-slate-600"}`}>{text}</button>)}
          </div>
          {form.payment === "paid" && booking.payment !== "paid" && <p className="text-[12.5px] text-slate-500">Records the remaining balance as received (owner or finance only). Check the money arrived first.</p>}
          {form.payment === "waiting" && booking.payment !== "waiting" && <p className="text-[12.5px] text-slate-500">Bank transfer before the trip; the driver won&apos;t collect cash.</p>}
        </fieldset> : <p className="border-t border-slate-100 pt-3 text-[12.5px] text-slate-500">Paid by card online; the payment can&apos;t be changed here.</p>}
        <p className="text-[12.5px] text-slate-500">The price doesn&apos;t change. A driver who already has the job gets the updated job in Telegram.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-black text-ink disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={18} />}Save changes</button>
      </form>
      {/* Outside the form: its password prompt has its own form. */}
      <div className="mt-4 flex justify-center border-t border-slate-100 pt-3"><BookingDeleteButton reference={booking.reference} asText onDone={onClose} /></div>
    </div>
  </Modal>;
}

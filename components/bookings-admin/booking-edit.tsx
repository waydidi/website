"use client";
import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingDeleteButton } from "@/components/booking-delete-button";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

// "Edit" on a booking card: a sheet from the bottom to change the date and time (and the return's), the
// car class and the number of passengers and bags; the driver with the job gets the updated job post.
// Deleting the booking (with the admin password) is at the bottom.
export type EditableBooking = { reference: string; pickupDate: string; pickupTime: string; returnDate: string | null; returnTime: string | null; vehicle: string; passengers: number; luggage: number };
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
  const [form, setForm] = useState({ ...booking, vehicle, returnDate: booking.returnDate ?? "", returnTime: booking.returnTime ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | number) => setForm((f) => ({ ...f, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.reference)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickupDate: form.pickupDate, pickupTime: form.pickupTime, returnDate: form.returnDate, returnTime: form.returnTime, vehicle: form.vehicle, passengers: Number(form.passengers), luggage: Number(form.luggage) }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The booking could not be saved.");
      onClose(); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal open onClose={onClose} locked={busy} sheet overlayClassName="z-[70] bg-black/40 sm:items-end sm:p-0" asChild>
    <div className="max-h-[90dvh] w-full max-w-lg animate-in slide-in-from-bottom overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] duration-300">
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
      <div className="flex items-center justify-between">
        <ModalTitle className="text-lg font-black">Edit · {booking.reference}</ModalTitle>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <form onSubmit={save} className="mt-4 grid gap-3 text-[14px]">
        <p className="font-bold">{booking.returnDate ? "First trip" : "Pickup"}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-slate-600">Date<input type="date" required value={form.pickupDate} onChange={(e) => set("pickupDate", e.target.value)} className={field} /></label>
          <label className="grid gap-1 text-slate-600">Time<input type="time" required value={form.pickupTime} onChange={(e) => set("pickupTime", e.target.value)} className={field} /></label>
        </div>
        {booking.returnDate && <>
          <p className="mt-1 font-bold">Second trip</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-slate-600">Date<input type="date" required value={form.returnDate} onChange={(e) => set("returnDate", e.target.value)} className={field} /></label>
            <label className="grid gap-1 text-slate-600">Time<input type="time" required value={form.returnTime} onChange={(e) => set("returnTime", e.target.value)} className={field} /></label>
          </div>
        </>}
        <label className="mt-1 grid gap-1 text-slate-600">Vehicle
          <select value={form.vehicle} onChange={(e) => set("vehicle", e.target.value)} className={field}>
            {(Object.keys(VEHICLES) as VehicleId[]).map((id) => <option key={id} value={id}>{VEHICLES[id].name} · up to {VEHICLES[id].passengers} people, {VEHICLES[id].bags} bags</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-slate-600">Passengers<input type="number" inputMode="numeric" min={1} max={30} required value={form.passengers} onChange={(e) => set("passengers", e.target.value)} className={field} /></label>
          <label className="grid gap-1 text-slate-600">Bags<input type="number" inputMode="numeric" min={0} max={40} required value={form.luggage} onChange={(e) => set("luggage", e.target.value)} className={field} /></label>
        </div>
        <p className="text-[12.5px] text-slate-500">The price doesn&apos;t change. A driver who already has the job gets the updated job in Telegram.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-black text-ink disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={18} />}Save changes</button>
      </form>
      {/* Outside the form: its password prompt has its own form. */}
      <div className="mt-4 flex justify-center border-t border-slate-100 pt-3"><BookingDeleteButton reference={booking.reference} asText onDone={onClose} /></div>
    </div>
  </Modal>;
}

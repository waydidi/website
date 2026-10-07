"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DriverPicker, type PickerDriver } from "@/components/bookings-admin/driver-picker";
import { AddDriverDialog } from "@/components/admin-overview/upcoming-rides";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

export type EditableTrip = { pickupDate: string; pickupTime: string; returnDate: string | null; returnTime: string | null; vehicle: string; passengers: number; luggage: number };
const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:border-brand";

// "Edit" in the bookings list: trip details (date, time, car class, passengers, luggage) and the driver.
export function EditDriverButton({ reference, drivers, current, canAssign, trip }: { reference: string; drivers: PickerDriver[]; current: string | null; canAssign: boolean; trip?: EditableTrip }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(trip);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(reference)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const out = await res.json().catch(() => ({})) as { error?: string; changed?: boolean };
      if (!res.ok) { setNote({ ok: false, text: out.error ?? "That didn't save." }); return; }
      setNote({ ok: true, text: out.changed ? "Saved. If a driver has the job, they get an updated job post in Telegram." : "Nothing changed." });
      router.refresh();
    } finally { setBusy(false); }
  }
  const set = (k: keyof EditableTrip, v: string | number) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const car = form ? VEHICLES[form.vehicle as VehicleId] : undefined;

  return <>
    <button type="button" onClick={() => { setForm(trip); setNote(null); setOpen(true); }} className="text-[14px] font-semibold text-brand-darker hover:underline">Edit</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[24px] border-0 bg-white p-6 text-slate-900 sm:max-w-md">
        <DialogTitle className="text-[20px] font-semibold">Edit {reference}</DialogTitle>
        <DialogDescription>Change the trip details or the driver.</DialogDescription>
        {form && <form onSubmit={save} className="mt-2 grid gap-3 text-[13px]">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 font-medium text-slate-600">Pickup date<input type="date" required value={form.pickupDate} onChange={(e) => set("pickupDate", e.target.value)} className={field} /></label>
            <label className="grid gap-1 font-medium text-slate-600">Pickup time<input type="time" required step={300} value={form.pickupTime} onChange={(e) => set("pickupTime", e.target.value)} className={field} /></label>
          </div>
          {form.returnDate !== null && <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 font-medium text-slate-600">Return date<input type="date" required value={form.returnDate} onChange={(e) => set("returnDate", e.target.value)} className={field} /></label>
            <label className="grid gap-1 font-medium text-slate-600">Return time<input type="time" required step={300} value={form.returnTime ?? ""} onChange={(e) => set("returnTime", e.target.value)} className={field} /></label>
          </div>}
          <label className="grid gap-1 font-medium text-slate-600">Car class
            <select value={form.vehicle} onChange={(e) => set("vehicle", e.target.value)} className={field}>
              {(Object.keys(VEHICLES) as VehicleId[]).map((v) => <option key={v} value={v}>{VEHICLES[v].name} (up to {VEHICLES[v].passengers} people, {VEHICLES[v].bags} bags)</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 font-medium text-slate-600">Passengers<input type="number" required min={1} max={30} value={form.passengers} onChange={(e) => set("passengers", Number(e.target.value))} className={field} /></label>
            <label className="grid gap-1 font-medium text-slate-600">Luggage<input type="number" required min={0} max={40} value={form.luggage} onChange={(e) => set("luggage", Number(e.target.value))} className={field} /></label>
          </div>
          {car && (form.passengers > car.passengers || form.luggage > car.bags) && <p className="text-red-600">The {car.name} carries up to {car.passengers} people and {car.bags} bags.</p>}
          <p className="text-slate-500">The price stays the same. Change it separately if the new trip costs more or less.</p>
          {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{note.text}</p>}
          <button disabled={busy} className="h-10 rounded-full bg-brand font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save trip details"}</button>
        </form>}
        <div className="mt-3 border-t border-slate-100 pt-3"><span className="mb-1.5 block text-[13px] font-medium text-slate-600">Driver</span>
          {canAssign ? null : <p className="mb-1.5 text-[13px] text-slate-500">Drivers can only be assigned to confirmed bookings.</p>}
          <DriverPicker reference={reference} drivers={drivers} current={current} canAssign={canAssign} wide onAddDriver={canAssign ? () => { setOpen(false); setAdding(true); } : undefined} /></div>
      </DialogContent>
    </Dialog>
    {adding && <AddDriverDialog reference={reference} onClose={() => setAdding(false)} />}
  </>;
}

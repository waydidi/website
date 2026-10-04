"use client";

import { ArrowRight, ImagePlus, LoaderCircle, Luggage, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DriverPicker, type PickerDriver } from "@/components/bookings-admin/driver-picker";

export type UpcomingRide = { reference: string; pickupDate: string; pickupTime: string; pickup: string; dropoff: string; name: string; vehicle: string; passengers: number; luggage: number; total?: number; paymentStatus?: string; status: string; driver: string | null; driverId: string | null; driverStatus?: string | null };

// The badge follows the driver's trip status once a driver is assigned.
const STATUS: Record<string, [string, string]> = {
  assigned: ["Assigned", "bg-emerald-50 text-emerald-700"],
  going_to_standby: ["On the way", "bg-blue-50 text-blue-700"],
  standby: ["Standing by", "bg-amber-50 text-amber-800"],
  passenger_verified: ["Passenger verified", "bg-cyan-50 text-cyan-800"],
  trip_started: ["Customer on the way", "bg-purple-50 text-purple-700"],
  passenger_picked_up: ["Customer on the way", "bg-purple-50 text-purple-700"],
  completed: ["Completed", "bg-emerald-100 text-emerald-800"],
  no_show: ["No-show", "bg-red-50 text-red-700"],
};
const badge = (r: UpcomingRide): [string, string] => !r.driverId ? ["Not assigned", "bg-red-50 text-red-700"] : STATUS[r.driverStatus ?? "assigned"] ?? STATUS.assigned;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Formatted by hand so the server and browser render the same text.
const day = (d: string) => { const [y, m, n] = d.split("-").map(Number); const w = new Date(Date.UTC(y, m - 1, n)).getUTCDay(); return `${DAYS[w]} ${n} ${MONTHS[m - 1]}`; };

// "27/09/2026 — 01:15 am", same as the form answers panel.
const dateTime = (date: string, time: string) => { const [y, m, d] = date.split("-"); const [h = 0, min = 0] = time.split(":").map(Number); return `${d}/${m}/${y} — ${String(h % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
// Paid online or by hand → green; cash to take on the day → red; anything else → amber with its status.
const payment = (s?: string): [string, string] => s === "paid" || s === "partially_refunded" ? ["Paid", "bg-emerald-50 text-emerald-700"] : s === "cash_due" ? ["Collect cash", "bg-red-50 text-red-700"] : [s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "Unpaid", "bg-amber-50 text-amber-800"];
const vehicleName = (v: string) => { const t = v.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

// Upcoming rides: journey details above, driver picker left and assignment status right.
export function UpcomingRides({ rides, drivers }: { rides: UpcomingRide[]; drivers: PickerDriver[] }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return <section aria-labelledby="upcoming-heading" className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
      <h2 id="upcoming-heading" className="text-[15px] font-black">Upcoming rides</h2>
      <Link href="/admin/bookings" className="text-[13px] font-bold text-[#C96100] hover:underline">See all →</Link>
    </div>
    {rides.length === 0 ? <p className="p-4 text-[14px] text-slate-500">No upcoming rides.</p> : <ul className="divide-y divide-slate-100">
      {rides.map((r) => <li key={r.reference} className="grid gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-500">{day(r.pickupDate)} · {r.pickupTime} · <span className="font-mono">{r.reference}</span>{r.status === "pending_payment" && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Awaiting payment</span>}</p>
          <p className="mt-1 truncate text-[15px] font-black">{r.name}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-slate-700"><span className="truncate">{r.pickup}</span><ArrowRight size={14} className="shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate">{r.dropoff}</span></p>
          <div className="mt-1.5 flex items-center gap-4 text-[13px] text-slate-600">
            <span className="inline-flex items-center gap-1.5" aria-label={`${r.passengers} passengers`}><Users size={16} className="shrink-0 text-slate-500" aria-hidden="true" />{r.passengers}</span>
            <span className="inline-flex items-center gap-1.5" aria-label={`${r.luggage} bags`}><Luggage size={16} className="shrink-0 text-slate-500" aria-hidden="true" />{r.luggage}</span>
            <span className="truncate">{r.vehicle.replace(/_/g, " ")}</span>
            <button type="button" aria-expanded={open === r.reference} onClick={() => setOpen(open === r.reference ? null : r.reference)} className="ml-auto shrink-0 font-semibold text-[#C96100] underline underline-offset-4">{open === r.reference ? "Hide details" : "See details"}</button>
          </div>
          {open === r.reference && <dl className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-4 text-[13.5px]">
            {([
              ["Passengers & luggage", <span key="pl" className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><Users size={15} aria-hidden="true" />{r.passengers}</span><span className="inline-flex items-center gap-1"><Luggage size={15} aria-hidden="true" />{r.luggage}</span></span>],
              ["Vehicle", vehicleName(r.vehicle)],
              ["Date & time", dateTime(r.pickupDate, r.pickupTime)],
              ["From", r.pickup],
              ["To", r.dropoff],
              ["Price", r.total ? `THB ${r.total.toLocaleString("en-US")}` : "Not set"],
              ["Payment", <span key="pay" className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${payment(r.paymentStatus)[1]}`}>{payment(r.paymentStatus)[0]}</span>],
            ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
            <Link href={`/admin/journeys/${encodeURIComponent(r.reference)}`} className="mt-1 justify-self-end text-[13px] font-semibold text-[#C96100] hover:underline">Open booking →</Link>
          </dl>}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <DriverPicker reference={r.reference} drivers={drivers} current={r.driverId} canAssign={r.status === "confirmed"} onAddDriver={() => setAdding(r.reference)} />
          <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${badge(r)[1]}`}>{badge(r)[0]}</span>
        </div>
      </li>)}
    </ul>}
    {adding && <AddDriverDialog reference={adding} onClose={() => setAdding(null)} />}
  </section>;
}

function ImageField({ name, label, optional }: { name: string; label: string; optional?: boolean }) {
  const [preview, setPreview] = useState("");
  return <label className="grid gap-1 text-[13px] font-semibold">{label}
    <span className="relative flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-[#FF8A05]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-[12px] font-medium"><ImagePlus size={20} />Upload image</span>}
      <input type="file" name={name} accept="image/jpeg,image/png,image/webp" required={!optional} className="absolute inset-0 opacity-0" onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : ""); }} />
    </span>
  </label>;
}

// Temporary (outsourced) driver: saved as a driver, then assigned to this ride.
export function AddDriverDialog({ reference, leg = "outbound", onClose, onDone }: { reference: string; leg?: "outbound" | "return"; onClose: () => void; onDone?: (driverUrl?: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = "h-10 rounded-lg border border-slate-200 px-3 text-[14px] font-normal outline-none focus:border-[#FF8A05]";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const form = new FormData(e.currentTarget);
      form.set("driverType", "outsource");
      const res = await fetch("/api/admin/drivers", { method: "POST", body: form });
      const out = await res.json().catch(() => ({})) as { error?: string; driver?: { id: string } };
      if (!res.ok || !out.driver) throw new Error(out.error ?? "The driver could not be saved.");
      const assign = await fetch("/api/admin/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", bookingReference: reference, leg, driverId: out.driver.id }) });
      const a = await assign.json().catch(() => ({})) as { error?: string; driverUrl?: string };
      if (!assign.ok) throw new Error(a.error ?? "Driver saved, but could not be assigned.");
      onClose();
      if (onDone) onDone(a.driverUrl); else router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="add-driver-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div><h3 id="add-driver-title" className="text-[18px] font-black">Add driver</h3><p className="text-[12.5px] text-slate-500">Temporary outsourced driver for {reference}</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] font-semibold">Driver name<input name="fullName" required minLength={2} maxLength={100} className={input} /></label>
        <label className="grid gap-1 text-[13px] font-semibold">Phone number<input name="phone" type="tel" required pattern="[+0-9() .\-]{7,30}" className={input} /></label>
        <label className="grid gap-1 text-[13px] font-semibold">Car plate<input name="carPlate" required minLength={2} maxLength={30} className={`${input} uppercase`} /></label>
        <label className="grid gap-1 text-[13px] font-semibold">Vehicle<input name="vehicle" required minLength={2} maxLength={150} placeholder="e.g. Toyota Fortuner, white" className={input} /></label>
        <label className="grid gap-1 text-[13px] font-semibold">Vehicle type<select name="vehicleType" required defaultValue="" className={input}><option value="" disabled>Choose</option><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="minivan">Minivan</option></select></label>
        <ImageField name="profilePhoto" label="Profile photo (optional)" optional />
        <ImageField name="idImage" label="Driving License/Thai ID" />
        <ImageField name="carImage" label="Car picture" />
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF8A05] text-[14px] font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Save & assign driver</button>
    </form>
  </div>;
}

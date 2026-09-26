"use client";

import { CheckCircle2, Download, LoaderCircle, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB, FERRY_HOTEL_THB } from "@/lib/addons";
import { isAirportPickup } from "@/lib/trip-rules";
import { VEHICLES } from "@/lib/vehicles";

type Service = "transfer" | "hourly" | "tour";
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const field = "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-[#FF8A05]";
const label = "block text-[13px] font-medium text-slate-600";

function Stepper({ value, set, max, labelText }: { value: number; set: (n: number) => void; max: number; labelText: string }) {
  return <span className="flex items-center gap-2">
    <button type="button" aria-label={`Fewer ${labelText}`} disabled={value <= 0} onClick={() => set(value - 1)} className="grid size-8 place-items-center rounded-full border border-slate-300 disabled:opacity-40"><Minus size={15} /></button>
    <span className="w-5 text-center font-medium tabular-nums">{value}</span>
    <button type="button" aria-label={`More ${labelText}`} disabled={value >= max} onClick={() => set(value + 1)} className="grid size-8 place-items-center rounded-full border border-slate-300 disabled:opacity-40"><Plus size={15} /></button>
  </span>;
}

// "+ New booking": record a booking taken by phone, LINE or an agency and get its PDF.
export function NewBookingButton({ service }: { service: Service }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ reference: string; total: number; emailStatus: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blank = () => ({
    serviceType: service as Service, pickup: "", dropoff: "", bookedHours: 4, pickupDate: bangkokToday(), pickupTime: "09:00",
    returnOn: false, returnDate: "", returnTime: "", flightNumber: "",
    customerName: "", customerSurname: "", customerEmail: "", customerPhone: "", passengers: 2, luggage: 2,
    vehicle: "economy_sedan", fare: "", childSeats: 0, exchangeStop: false, ferryPeople: 0, discount: "",
    paid: false, pickupSign: "", specialRequests: "",
  });
  const [f, setF] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((c) => ({ ...c, [k]: v }));

  const fare = Math.max(0, Number(f.fare) || 0);
  const discount = Math.min(fare, Math.max(0, Number(f.discount) || 0));
  const addons = f.childSeats * CHILD_SEAT_THB + (f.exchangeStop ? EXCHANGE_STOP_THB : 0) + f.ferryPeople * FERRY_HOTEL_THB;
  const total = fare - discount + addons;

  async function save(sendEmail: boolean) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/manual-booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...f, fare, discount, sendEmail,
        bookedHours: f.serviceType === "hourly" ? f.bookedHours : undefined,
        returnDate: f.returnOn ? f.returnDate : "", returnTime: f.returnOn ? f.returnTime : "",
        flightNumber: isAirportPickup({ pickup: f.pickup, flightNumber: null }) ? f.flightNumber : "",
      }) });
      const out = await res.json().catch(() => ({})) as { error?: string; reference?: string; total?: number; emailStatus?: string };
      if (!res.ok || !out.reference) throw new Error(out.error ?? "The booking could not be saved.");
      setDone({ reference: out.reference, total: out.total ?? total, emailStatus: out.emailStatus ?? "not_sent" });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "The booking could not be saved."); }
    finally { setBusy(false); }
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next) { setDone(null); setError(""); setF(blank()); }
  }

  const ready = f.pickup.trim().length > 1 && (f.serviceType === "hourly" || f.dropoff.trim().length > 1) && f.customerName.trim() && /\S+@\S+\.\S+/.test(f.customerEmail) && f.customerPhone.trim().length > 4 && f.fare !== "";

  return <>
    <button type="button" onClick={() => { setF(blank()); setOpen(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 text-[15px] font-semibold text-white hover:bg-[#E67900]"><Plus size={17} strokeWidth={2.5} />New booking</button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="max-h-[92dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 text-slate-900 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 text-left">
          <div><DialogTitle className="text-[24px] font-semibold">{done ? "Booking saved" : "New booking"}</DialogTitle><DialogDescription>{done ? "It's in Bookings now, like any other booking." : "For rides booked by phone, LINE or an agency. Saved as a confirmed booking with a PDF."}</DialogDescription></div>
          <button type="button" onClick={() => close(false)} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-orange-50"><X size={20} /></button>
        </DialogHeader>

        {done ? <div className="grid gap-4 pt-2">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="shrink-0" /><div><p className="text-[18px] font-semibold">{done.reference}</p><p className="text-[14px]">Total {thb(done.total)} · {done.emailStatus === "sent" ? "Confirmation emailed to the customer" : done.emailStatus === "not_sent" ? "Not emailed" : "Email not sent (check email settings)"}</p></div></div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/bookings/${done.reference}/confirmation`} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#FF8A05] px-5 font-semibold text-white"><Download size={17} />Download PDF</a>
            <Link href={`/admin/journeys/${done.reference}`} className="inline-flex h-11 items-center rounded-full border border-slate-200 px-5 font-medium hover:border-[#FF8A05]">Open booking</Link>
            <button type="button" onClick={() => { setDone(null); setF(blank()); }} className="inline-flex h-11 items-center rounded-full px-4 font-medium text-slate-600 hover:bg-slate-50">Add another</button>
          </div>
        </div> : <form onSubmit={(e) => { e.preventDefault(); }} className="grid gap-5 pt-2">
          <section className="grid gap-3">
            <div role="tablist" aria-label="Service" className="inline-flex w-fit rounded-xl bg-[#E8EAEE] p-1">
              {([["transfer", "Transfer"], ["hourly", "By the hour"], ["tour", "Tour"]] as const).map(([id, text]) => <button key={id} type="button" role="tab" aria-selected={f.serviceType === id} onClick={() => set("serviceType", id)} className={`h-9 rounded-lg px-4 text-[14px] ${f.serviceType === id ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{text}</button>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Pickup<input className={field} value={f.pickup} onChange={(e) => set("pickup", e.target.value)} placeholder="Suvarnabhumi Airport (BKK)" /></label>
              {f.serviceType === "hourly"
                ? <label className={label}>Hours<input type="number" min={1} max={24} className={field} value={f.bookedHours} onChange={(e) => set("bookedHours", Number(e.target.value))} /></label>
                : <label className={label}>{f.serviceType === "tour" ? "Tour name" : "Drop-off"}<input className={field} value={f.dropoff} onChange={(e) => set("dropoff", e.target.value)} placeholder={f.serviceType === "tour" ? "Floating market day trip" : "Hilton Pattaya"} /></label>}
              <label className={label}>Pickup date<input type="date" className={field} value={f.pickupDate} onChange={(e) => set("pickupDate", e.target.value)} /></label>
              <label className={label}>Pickup time<input type="time" className={field} value={f.pickupTime} onChange={(e) => set("pickupTime", e.target.value)} /></label>
            </div>
            {f.serviceType === "transfer" && <>
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.returnOn} onChange={(e) => set("returnOn", e.target.checked)} className="size-4 accent-[#FF8A05]" />Add return trip</label>
              {f.returnOn && <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>Return date<input type="date" className={field} value={f.returnDate} min={f.pickupDate} onChange={(e) => set("returnDate", e.target.value)} /></label>
                <label className={label}>Return time<input type="time" className={field} value={f.returnTime} onChange={(e) => set("returnTime", e.target.value)} /></label>
              </div>}
            </>}
            {/* Only shown for airport pickups. */}
            {isAirportPickup({ pickup: f.pickup, flightNumber: null }) && <label className={label}>Flight number (optional)<input className={field} value={f.flightNumber} onChange={(e) => set("flightNumber", e.target.value.toUpperCase())} placeholder="TG 123" /></label>}
          </section>

          <section className="grid gap-3 border-t border-slate-100 pt-4">
            <p className="text-[15px] font-semibold">Customer</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>First name<input className={field} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} /></label>
              <label className={label}>Last name<input className={field} value={f.customerSurname} onChange={(e) => set("customerSurname", e.target.value)} /></label>
              <label className={label}>Email<input type="email" className={field} value={f.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} /></label>
              <label className={label}>Phone<input type="tel" className={field} value={f.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="+66 81 234 5678" /></label>
            </div>
            <div className="flex flex-wrap gap-6">
              <span className="flex items-center gap-3 text-[14px]">Passengers <Stepper value={f.passengers} set={(n) => set("passengers", Math.max(1, n))} max={20} labelText="passengers" /></span>
              <span className="flex items-center gap-3 text-[14px]">Bags <Stepper value={f.luggage} set={(n) => set("luggage", n)} max={30} labelText="bags" /></span>
            </div>
          </section>

          <section className="grid gap-3 border-t border-slate-100 pt-4">
            <p className="text-[15px] font-semibold">Car and price</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Vehicle<select className={field} value={f.vehicle} onChange={(e) => set("vehicle", e.target.value)}>{Object.entries(VEHICLES).map(([id, v]) => <option key={id} value={id}>{v.name}</option>)}</select></label>
              <label className={label}>Fare (THB)<input type="number" min={0} inputMode="numeric" className={field} value={f.fare} onChange={(e) => set("fare", e.target.value)} placeholder="1500" /></label>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-[14px]">
              <div className="flex items-center justify-between gap-3"><span>Child seat · {thb(CHILD_SEAT_THB)} each</span><Stepper value={f.childSeats} set={(n) => set("childSeats", n)} max={4} labelText="child seats" /></div>
              <label className="flex items-center justify-between gap-3"><span>Currency exchange stop · {thb(EXCHANGE_STOP_THB)}</span><input type="checkbox" checked={f.exchangeStop} onChange={(e) => set("exchangeStop", e.target.checked)} className="size-5 accent-[#FF8A05]" /></label>
              <div className="flex items-center justify-between gap-3"><span>Ferry &amp; hotel transfer · {thb(FERRY_HOTEL_THB)} per person</span><Stepper value={f.ferryPeople} set={(n) => set("ferryPeople", n)} max={f.passengers} labelText="ferry tickets" /></div>
            </div>
            <label className={label}>Exclusive discount (THB, optional)<input type="number" min={0} inputMode="numeric" className={field} value={f.discount} onChange={(e) => set("discount", e.target.value)} placeholder="0" /></label>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
              <div role="radiogroup" aria-label="Payment" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
                {([[true, "Paid"], [false, "Pay in cash"]] as const).map(([v, text]) => <button key={text} type="button" role="radio" aria-checked={f.paid === v} onClick={() => set("paid", v)} className={`h-9 rounded-lg px-4 text-[14px] ${f.paid === v ? `bg-white font-medium shadow-sm ${v ? "text-emerald-700" : "text-red-600"}` : "text-slate-600"}`}>{text}</button>)}
              </div>
              <p className="text-[15px]">Total <strong className="text-[20px] tabular-nums">{thb(total)}</strong></p>
            </div>
          </section>

          <section className="grid gap-3 border-t border-slate-100 pt-4">
            <label className={label}>Name on pickup sign (optional)<input className={field} value={f.pickupSign} onChange={(e) => set("pickupSign", e.target.value)} /></label>
            <label className={label}>Special requests (optional)<textarea rows={2} className={`${field} h-auto py-2`} value={f.specialRequests} onChange={(e) => set("specialRequests", e.target.value)} /></label>
          </section>

          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[14px] font-medium text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={busy || !ready} onClick={() => save(false)} className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 px-5 font-medium hover:border-[#FF8A05] disabled:opacity-40">{busy && <LoaderCircle size={16} className="animate-spin" />}Save booking</button>
            <button type="button" disabled={busy || !ready} onClick={() => save(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#FF8A05] px-5 font-semibold text-white disabled:opacity-40">{busy && <LoaderCircle size={16} className="animate-spin" />}Save &amp; email customer</button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}

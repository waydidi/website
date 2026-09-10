"use client";

import { Check, Clock3, Download, Mail, RotateCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";

type Booking = { reference:string;customerName:string;customerEmail:string;customerPhone:string;pickup:string;dropoff:string;pickupDate:string;pickupTime:string;passengers:number;luggage:number;vehicle:string;total:number;status:string;emailStatus:string;paymentMethod:string;flightNumber:string|null;pickupSign:string|null;pickupInstructions:string|null;childSeats:number;oversizedLuggage:boolean;specialRequests:string|null };

export default function ConfirmationClient({ reference, token, sessionId }: { reference: string; token: string; sessionId: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [busy, setBusy] = useState<"email"|"cancel"|null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async (attempt = 1) => {
    setFailed(false); setTimedOut(false);
    try {
      let response = await fetch(`/api/bookings/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Booking unavailable");
      let result = await response.json() as Booking;
      setBooking(result);
      if (result.status === "pending_payment" && sessionId) {
        await fetch(`/api/bookings/${encodeURIComponent(reference)}/verify`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token,sessionId}) });
        response = await fetch(`/api/bookings/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (response.ok) { result = await response.json() as Booking; setBooking(result); }
      }
      if (result.status === "pending_payment") {
        if (attempt < 30) window.setTimeout(() => load(attempt + 1), 2000);
        else setTimedOut(true);
      }
    } catch { setFailed(true); }
  }, [reference, token, sessionId]);

  useEffect(() => { load(); }, [load]);

  const retryEmail = async () => {
    setBusy("email"); setMessage("");
    const response = await fetch(`/api/bookings/${encodeURIComponent(reference)}/email`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token}) });
    const result = await response.json() as { emailStatus?:string; error?:string };
    setMessage(response.ok ? "Confirmation email sent." : result.error ?? "Email could not be sent.");
    setBusy(null); if (response.ok) load();
  };

  const cancelBooking = async () => {
    if (!window.confirm("Cancel this booking and request the Stripe refund? This cannot be undone.")) return;
    setBusy("cancel"); setMessage("");
    const response = await fetch(`/api/bookings/${encodeURIComponent(reference)}/cancel`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token}) });
    const result = await response.json() as { status?:string; refundStatus?:string; error?:string };
    setMessage(response.ok ? `Booking cancelled. Refund status: ${result.refundStatus ?? "processing"}.` : result.error ?? "Cancellation failed.");
    setBusy(null); if (response.ok) load();
  };

  if (failed) return <main className="grid min-h-screen place-items-center bg-white p-6"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center"><h1 className="text-2xl font-black">Confirmation link unavailable</h1><p className="mt-3 text-slate-600">Check the link in your Stripe receipt or contact Waydidi support.</p><button onClick={()=>load()} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white"><RotateCw size={18}/> Try again</button></div></main>;
  if (!booking || booking.status === "pending_payment") return <main className="grid min-h-screen place-items-center bg-white p-6 text-[#1f1726]"><div className="max-w-md text-center"><Clock3 className="mx-auto animate-pulse text-[#D96F00]" size={42}/><h1 className="mt-5 text-3xl font-black">Confirming your payment…</h1><p className="mt-3 text-slate-500">Stripe confirmation can take a few moments. Keep this page open.</p>{timedOut&&<><p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Confirmation is taking longer than expected. Your payment is not lost.</p><button onClick={()=>load()} className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white"><RotateCw size={18}/> Check payment again</button></>}</div></main>;

  const fields = [["Passenger",booking.customerName],["Email",booking.customerEmail],["Phone / WhatsApp",booking.customerPhone],["Pickup",booking.pickup],["Drop-off",booking.dropoff],["Date & time",`${booking.pickupDate} at ${booking.pickupTime}`],["Travelers",`${booking.passengers} passengers · ${booking.luggage} bags`],["Vehicle",booking.vehicle],["Payment",booking.paymentMethod === "cash" ? "Cash at pickup" : "Paid online"],["Flight",booking.flightNumber],["Pickup sign",booking.pickupSign],["Child seats",booking.childSeats ? String(booking.childSeats) : null],["Oversized luggage",booking.oversizedLuggage ? "Yes" : null],["Pickup instructions",booking.pickupInstructions],["Special requests",booking.specialRequests],["Total",`฿${booking.total.toLocaleString()}`]].filter((field): field is [string,string] => Boolean(field[1]));
  const cancelled = booking.status === "cancelled";
  const pickupTime = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
  const canCancel = booking.status === "confirmed" && booking.paymentMethod !== "cash" && pickupTime - Date.now() >= 24*60*60*1000;

  return <main className="min-h-screen bg-[#f6f7f9] px-4 py-6 sm:px-5 sm:py-10"><div className="booking-confirmation mx-auto max-w-[850px] overflow-hidden rounded-[32px] bg-white shadow-xl shadow-orange-950/10"><div className="bg-[#FF8A05] p-8 text-white sm:p-11"><a href="/" className="mb-8 inline-flex text-white" aria-label="Waydidi home"><WaydidiLogo className="h-20 w-auto"/></a><span className="grid size-14 place-items-center rounded-full bg-white/20 text-white">{cancelled?<XCircle size={30}/>:<Check size={30} strokeWidth={3}/>}</span><p className="mt-6 text-sm font-bold uppercase tracking-[.16em] text-white/80">{cancelled?"Booking cancelled":"Payment received"}</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em]">{cancelled?"Your ride was cancelled.":"Your ride is booked."}</h1><p className="mt-3 text-white/80">Booking reference <strong className="text-white">{booking.reference}</strong></p></div><div className="p-8 sm:p-11"><div className="grid gap-8 sm:grid-cols-2">{fields.map(([label,value])=><div key={label}><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">{label}</p><p className="mt-2 font-bold">{value}</p></div>)}</div>{message&&<p className="mt-8 rounded-xl bg-slate-100 p-4 text-sm font-semibold">{message}</p>}<div className="no-print mt-8 flex flex-wrap gap-3">{!cancelled&&<a href={`/api/bookings/${encodeURIComponent(reference)}/pdf?token=${encodeURIComponent(token)}`} className="flex h-13 items-center gap-2 rounded-full bg-[#FF8A05] px-7 font-bold text-white"><Download size={19}/> Download PDF</a>}{!cancelled&&booking.emailStatus!=="sent"&&<button onClick={retryEmail} disabled={busy!==null} className="flex h-13 items-center gap-2 rounded-full border border-slate-200 px-6 font-bold disabled:opacity-50"><Mail size={18}/> {busy==="email"?"Sending…":"Retry email"}</button>}{canCancel&&<button onClick={cancelBooking} disabled={busy!==null} className="h-13 rounded-full border border-red-200 px-6 font-bold text-red-700 disabled:opacity-50">{busy==="cancel"?"Cancelling…":"Cancel & refund"}</button>}</div></div></div></main>;
}

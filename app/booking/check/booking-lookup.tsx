"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, CalendarDays, CarFront, CheckCircle2, Clock3, Luggage, MapPin, Search, Users, XCircle } from "lucide-react";
import { WaydidiLogo } from "@/components/waydidi-logo";

type BookingResult = { reference:string;status:string;pickup:string;dropoff:string;pickupDate:string;pickupTime:string;passengers:number;luggage:number;vehicle:string;total:number };

const statusContent: Record<string, { label:string; detail:string; style:string; icon:typeof CheckCircle2 }> = {
  confirmed: { label:"Confirmed", detail:"Your payment has been received and your private transfer is booked.", style:"bg-emerald-100 text-emerald-800", icon:CheckCircle2 },
  completed: { label:"Completed", detail:"Your Waydidi journey has been completed.", style:"bg-emerald-100 text-emerald-800", icon:CheckCircle2 },
  pending_payment: { label:"Payment pending", detail:"Payment has not been confirmed yet. Complete Stripe Checkout or contact Waydidi if you already paid.", style:"bg-amber-100 text-amber-900", icon:Clock3 },
  cancelled: { label:"Cancelled", detail:"This booking has been cancelled. Any approved refund is returned through Stripe.", style:"bg-red-100 text-red-800", icon:XCircle },
};

export default function BookingLookup() {
  const [reference,setReference]=useState("");
  const [email,setEmail]=useState("");
  const [booking,setBooking]=useState<BookingResult|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  async function lookup(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setBooking(null);
    try {
      const response=await fetch("/api/bookings/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference,email})});
      const result=await response.json() as BookingResult&{error?:string};
      if(!response.ok) throw new Error(result.error??"Booking lookup failed.");
      setBooking(result);
    } catch(reason) { setError(reason instanceof Error?reason.message:"Booking lookup failed."); }
    finally { setLoading(false); }
  }

  const status=booking ? statusContent[booking.status]??{label:booking.status.replaceAll("_"," "),detail:"Contact Waydidi for the latest booking information.",style:"bg-slate-100 text-slate-800",icon:Clock3} : null;
  const StatusIcon=status?.icon??Clock3;

  return <main className="min-h-screen bg-slate-50 text-[#1f1726]"><header className="flex h-[112px] items-center bg-[#FF8A05] px-5 sm:px-8"><a href="/" className="inline-flex text-white" aria-label="Waydidi home"><WaydidiLogo className="h-[88px] w-auto"/></a></header><section className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[400px_1fr] lg:px-8 lg:py-16"><div><p className="text-sm font-black uppercase tracking-[.16em] text-[#D96F00]">Manage your journey</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em]">Check your booking</h1><p className="mt-3 leading-7 text-slate-600">Enter the booking reference from your confirmation and the same email used at checkout.</p><form onSubmit={lookup} className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><label className="block text-sm font-bold">Booking reference<input required value={reference} onChange={(event)=>setReference(event.target.value.toUpperCase())} maxLength={15} autoComplete="off" placeholder="WD-1A2B3C4D5E6F" className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base uppercase outline-none focus:border-[#FF8A05]"/></label><label className="mt-5 block text-sm font-bold">Booking email<input required type="email" value={email} onChange={(event)=>setEmail(event.target.value)} autoComplete="email" placeholder="you@email.com" className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base outline-none focus:border-[#FF8A05]"/></label>{error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}<button disabled={loading} className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white disabled:opacity-60"><Search size={18}/>{loading?"Checking…":"Check booking"}</button></form><a href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={17}/>Back to homepage</a></div><div className="min-h-[420px]">{booking&&status?<article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="bg-[#FF8A05] p-7 text-white"><span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 font-bold"><StatusIcon size={20}/>{status.label}</span><h2 className="mt-5 text-3xl font-black">{booking.reference}</h2><p className="mt-2 max-w-xl text-white/85">{status.detail}</p></div><div className="grid gap-6 p-7 sm:grid-cols-2"><Detail icon={MapPin} label="Pickup" value={booking.pickup}/><Detail icon={MapPin} label="Drop-off" value={booking.dropoff}/><Detail icon={CalendarDays} label="Date and time" value={`${booking.pickupDate} at ${booking.pickupTime}`}/><Detail icon={CarFront} label="Vehicle" value={booking.vehicle}/><Detail icon={Users} label="Passengers" value={String(booking.passengers)}/><Detail icon={Luggage} label="Luggage" value={String(booking.luggage)}/><div className="border-t border-slate-200 pt-5 sm:col-span-2"><div className="flex items-end justify-between gap-4"><span><span className="block text-xs font-black uppercase tracking-[.14em] text-slate-400">Total</span></span><strong className="text-3xl">฿{booking.total.toLocaleString()}</strong></div></div></div></article>:<div className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Search className="mx-auto text-slate-300" size={44}/><h2 className="mt-4 text-xl font-black">Your booking will appear here</h2><p className="mt-2 text-slate-500">Your email is required to protect your trip details.</p></div></div>}</div></section></main>;
}

function Detail({icon:Icon,label,value}:{icon:typeof MapPin;label:string;value:string}) {
  return <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-[#D96F00]"><Icon size={19}/></span><span><span className="block text-xs font-black uppercase tracking-[.14em] text-slate-400">{label}</span><strong className="mt-1 block leading-6">{value}</strong></span></div>;
}

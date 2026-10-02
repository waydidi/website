"use client";
import { useEffect, useState } from "react";
import { refundPercent, serviceStartMs } from "@/lib/refund-policy";
import type { Booking } from "./booking-flow";
export function CancellationTerms({date,time}:{date:string;time:string}) {
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 let hours:number|null=null;try{hours=date&&time?(serviceStartMs(date,time)-now)/3600000:null;}catch{}
 const percent=hours===null?null:refundPercent("customer_cancellation",hours);
 return <p className="text-sm leading-6">{percent===null?"Choose a pickup time to see cancellation terms.":percent===100?"Full refund for cancellations more than 48 hours before pickup; 50% at 24–48 hours; no refund with less than 24 hours' notice.":percent===50?"Your pickup is 24–48 hours away: 50% refund if cancelled with at least 24 hours' notice.":"Your pickup is less than 24 hours away: customer cancellations are non-refundable."} <a href="/refund-policy" className="underline" target="_blank" rel="noreferrer">Cancellation policy</a></p>;
}
export function CheckoutSummary({booking,vehicle,returnDate="",returnTime="",returnTrip=false}:{booking:Booking;vehicle:string;returnDate?:string;returnTime?:string;returnTrip?:boolean}) {
 return <aside aria-label="Your journey and cancellation terms" className="mx-auto max-w-[1120px] rounded-2xl border bg-white p-5 text-ink"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Pickup</dt><dd className="font-semibold">{booking.pickup}</dd></div><div><dt className="text-sm text-slate-500">Destination</dt><dd className="font-semibold">{booking.dropoff}</dd></div><div><dt className="text-sm text-slate-500">Pickup time (Thailand)</dt><dd>{booking.date} · {booking.time}</dd></div><div><dt className="text-sm text-slate-500">Vehicle and group</dt><dd>{vehicle} · {booking.passengers} passengers · {booking.luggage} checked bags</dd></div>{returnTrip&&<div><dt>Return pickup (Thailand)</dt><dd>{returnDate} · {returnTime}</dd></div>}</dl><div className="mt-4 border-t pt-3"><CancellationTerms date={booking.date} time={booking.time}/></div></aside>;
}

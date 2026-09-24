import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { AccountShell, formatTripDate } from "@/components/account/account-shell";
import { TripActions } from "@/components/account/trip-actions";
import { vehicleName } from "@/components/account/trip-card";
import { canManageStatus } from "@/lib/booking-management";
import { customerBooking, driverStatuses, requireCustomer } from "@/lib/customer-auth";
import { driverStatusLabel, tripBucket } from "@/lib/customer-account";

export const metadata: Metadata = { title: "Trip details · Waydidi", robots: { index: false, follow: false } };

const steps = [
  { key: "confirmed", label: "Booking confirmed" },
  { key: "assigned", label: "Driver assigned" },
  { key: "trip_started", label: "Driver on the way" },
  { key: "passenger_verified", label: "On board" },
  { key: "completed", label: "Trip completed" },
];
const stepIndex: Record<string, number> = { assigned: 1, standby: 1, trip_started: 2, passenger_verified: 3, completed: 4 };

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-6 border-b border-slate-100 py-3 last:border-0"><dt className="text-slate-500">{label}</dt><dd className="text-right font-bold">{value}</dd></div>;
}

export default async function TripDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const customer = await requireCustomer(`/account/trips/${reference}`);
  const trip = await customerBooking(customer, reference.toUpperCase());
  if (!trip) notFound();
  const bucket = tripBucket(trip.status, trip.pickupDate, trip.pickupTime);
  const driverStatus = (await driverStatuses([trip.reference])).get(trip.reference);
  const progress = trip.status === "completed" ? 4 : stepIndex[driverStatus ?? ""] ?? 0;
  const payment = trip.paymentMethod === "cash" ? "Cash to driver" : "Card";

  return <AccountShell name={customer.name} email={customer.email}>
    <Link href="/account/trips" className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#D96F00]"><ArrowLeft size={16} /> My trips</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-bold text-slate-500">Booking reference</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">{trip.reference}</h1></div>
      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${bucket === "cancelled" ? "bg-red-50 text-red-700" : bucket === "completed" ? "bg-slate-200 text-slate-700" : "bg-emerald-50 text-emerald-700"}`}>{bucket}</span>
    </div>

    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-5">
        {bucket !== "cancelled" ? <section className="rounded-[22px] bg-white p-6" aria-labelledby="trip-status">
          <h2 id="trip-status" className="font-black">Trip status</h2>
          <p className="mt-1 text-sm text-slate-600">{trip.status === "completed" ? "This trip is complete. Thank you for riding with Waydidi." : driverStatusLabel(driverStatus)}</p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-5">
            {steps.map((step, i) => <li key={step.key} className="flex items-center gap-2 sm:flex-col sm:items-start">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${i <= progress ? "bg-[#FF8A05] text-white" : "bg-slate-100 text-slate-400"}`}>{i <= progress ? <Check size={15} /> : i + 1}</span>
              <span className={`text-sm font-bold ${i <= progress ? "" : "text-slate-400"}`}>{step.label}</span>
            </li>)}
          </ol>
        </section> : <section className="rounded-[22px] bg-red-50 p-6 text-red-800"><h2 className="font-black">This trip was cancelled</h2>{trip.cancellationReason ? <p className="mt-1">{trip.cancellationReason}</p> : null}{trip.refundStatus ? <p className="mt-1">Refund status: <strong>{trip.refundStatus.replace(/_/g, " ")}</strong></p> : null}</section>}

        <section className="rounded-[22px] bg-white p-6" aria-labelledby="trip-details">
          <h2 id="trip-details" className="font-black">{trip.serviceType === "hourly" ? "Hourly driver" : "Journey"}</h2>
          <dl className="mt-3 text-sm">
            <Row label="Pickup" value={trip.pickup} />
            {trip.serviceType === "hourly" ? <Row label="Duration" value={`${trip.bookedHours ?? "–"} hours`} /> : <Row label="Drop-off" value={trip.dropoff} />}
            <Row label="Date & time" value={formatTripDate(trip.pickupDate, trip.pickupTime)} />
            {trip.returnDate && trip.returnTime ? <Row label="Return" value={`${trip.returnPickup ?? trip.dropoff} → ${trip.returnDropoff ?? trip.pickup}, ${formatTripDate(trip.returnDate, trip.returnTime)}`} /> : null}
            {trip.flightNumber ? <Row label="Flight" value={trip.flightNumber} /> : null}
            <Row label="Vehicle" value={vehicleName(trip.vehicle)} />
            <Row label="Passengers & bags" value={`${trip.passengers} passengers · ${trip.luggage} bags`} />
            {trip.childSeats ? <Row label="Child seats" value={String(trip.childSeats)} /> : null}
          </dl>
        </section>

        <section className="rounded-[22px] bg-white p-6" aria-labelledby="trip-payment">
          <h2 id="trip-payment" className="font-black">Payment</h2>
          <dl className="mt-3 text-sm">
            <Row label="Total" value={`฿${trip.total.toLocaleString()}`} />
            <Row label="Method" value={payment} />
            <Row label="Status" value={trip.paymentStatus.replace(/_/g, " ")} />
          </dl>
        </section>
      </div>

      <aside className="grid content-start gap-5">
        <div className="rounded-[22px] bg-white p-5"><TripActions reference={trip.reference} canManage={bucket === "upcoming" && canManageStatus(trip.status)} hasReceipt={trip.status === "confirmed" || trip.status === "completed"} canReturn={trip.serviceType !== "hourly" && !trip.returnDate} /></div>
        <p className="px-1 text-sm leading-6 text-slate-500">Date changes are made online; cancellations are handled by email under the <Link href="/cancellation-refund-policy" className="font-bold text-[#C96100] hover:underline">cancellation policy</Link>. Meeting instructions and your trip PIN are in your confirmation email.</p>
      </aside>
    </div>
  </AccountShell>;
}

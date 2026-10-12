import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TripCard } from "@/components/account/trip-card";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { currentCustomer, customerBookings, driverStatuses } from "@/lib/customer-auth";
import { tripBucket } from "@/lib/customer-account";

export const metadata: Metadata = { title: "My trips · Waydidi", robots: { index: false, follow: false } };

/** My Trips inside LINE: upcoming trips first, compact for the LINE in-app browser. */
export default async function LiffTripsPage() {
  const customer = await currentCustomer();
  if (!customer) redirect("/liff");
  const all = (await customerBookings(customer)).map((trip) => ({ trip, bucket: tripBucket(trip.status, trip.pickupDate, trip.pickupTime) }));
  const upcoming = all.filter((x) => x.bucket === "upcoming").reverse();
  const past = all.filter((x) => x.bucket !== "upcoming").slice(0, 5);
  const statuses = await driverStatuses(upcoming.map((x) => x.trip.reference));
  return <main className="min-h-screen bg-canvas px-4 pb-16 pt-5 text-plum">
    <div className="mx-auto grid max-w-liff gap-4">
      <header className="flex items-center justify-between gap-3">
        <WaydidiLogo className="h-[40px] w-[105px]" />
        <p className="truncate text-sm font-bold text-slate-600">{customer.name ? `Hi ${customer.name}` : customer.email}</p>
      </header>
      <h1 className="text-2xl font-black tracking-[-.03em]">My trips</h1>
      {upcoming.length ? upcoming.map(({ trip, bucket }, i) => <TripCard key={trip.reference} trip={trip} bucket={bucket} driverStatus={statuses.get(trip.reference)} featured={i === 0} />)
        : <div className="rounded-card bg-white p-6 text-center text-slate-600">No upcoming trips.<div><Link href="/#booking-search" className="mt-4 inline-flex min-h-tap items-center rounded-full bg-brand px-6 font-black text-ink">Book a ride</Link></div></div>}
      {past.length ? <>
        <h2 className="mt-4 font-black">Earlier trips</h2>
        {past.map(({ trip, bucket }) => <TripCard key={trip.reference} trip={trip} bucket={bucket} />)}
      </> : null}
      <Link href="/account/trips?tab=completed" className="inline-flex min-h-tap items-center justify-center rounded-full bg-white font-bold">All trips and receipts</Link>
    </div>
  </main>;
}

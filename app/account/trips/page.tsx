import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { TripCard } from "@/components/account/trip-card";
import { customerBookings, driverStatuses, requireCustomer } from "@/lib/customer-auth";
import { tripBucket, type TripBucket } from "@/lib/customer-account";

export const metadata: Metadata = { title: "My trips · Waydidi", robots: { index: false, follow: false } };
const tabs: { id: TripBucket; label: string }[] = [{ id: "upcoming", label: "Upcoming" }, { id: "completed", label: "Completed" }, { id: "cancelled", label: "Cancelled" }];

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const customer = await requireCustomer("/account/trips");
  const params = await searchParams;
  const tab = tabs.find((t) => t.id === params.tab)?.id ?? "upcoming";
  const query = (params.q ?? "").trim().toUpperCase().slice(0, 20);
  const all = (await customerBookings(customer)).map((trip) => ({ trip, bucket: tripBucket(trip.status, trip.pickupDate, trip.pickupTime) }));
  const counts = Object.fromEntries(tabs.map((t) => [t.id, all.filter((x) => x.bucket === t.id).length]));
  let list = all.filter((x) => x.bucket === tab && (!query || x.trip.reference.includes(query) || x.trip.pickup.toUpperCase().includes(query) || x.trip.dropoff.toUpperCase().includes(query)));
  if (tab === "upcoming") list = list.reverse();
  const statuses = tab === "upcoming" ? await driverStatuses(list.map((x) => x.trip.reference)) : new Map<string, string>();
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="My trips" subtitle="Every booking made with your email, including ones made as a guest." />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav className="inline-flex rounded-full bg-white p-1" aria-label="Trip status">
        {tabs.map((t) => <Link key={t.id} href={`/account/trips?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-black ${t.id === tab ? "bg-[#FF8A05] text-white" : "text-slate-600 hover:text-[#211726]"}`}>{t.label} <span className="opacity-70">{counts[t.id]}</span></Link>)}
      </nav>
      <form className="flex gap-2" role="search"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={params.q ?? ""} placeholder="Reference or place" aria-label="Search trips" className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#FF8A05] sm:w-56" /><button className="rounded-full bg-[#211726] px-4 text-sm font-black text-white">Search</button></form>
    </div>
    <div className="mt-6 grid gap-3">
      {list.length ? list.map(({ trip, bucket }) => <TripCard key={trip.reference} trip={trip} bucket={bucket} driverStatus={statuses.get(trip.reference)} />) : <div className="rounded-[22px] bg-white p-8 text-center text-slate-600">{query ? "No trips match your search." : `No ${tab} trips.`}{tab === "upcoming" && !query ? <div><Link href="/#booking-search" className="mt-4 inline-flex rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white">Book a ride</Link></div> : null}</div>}
    </div>
  </AccountShell>;
}

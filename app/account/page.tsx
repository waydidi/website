import type { Metadata } from "next";
import Link from "next/link";
import { CarFront, Headphones, Search, UserRound } from "lucide-react";
import { AccountShell } from "@/components/account/account-shell";
import { TripCard } from "@/components/account/trip-card";
import { LoyaltyCard } from "@/components/account/loyalty-card";
import { loyaltyStatus } from "@/lib/loyalty";
import { memberTierStatus } from "@/lib/member-tier";
import { listMemberGifts } from "@/lib/gifts";
import { GiftWallet } from "@/components/account/gift-wallet";
import { MysteryBoxes } from "@/components/account/mystery-boxes";
import { listMemberBoxes } from "@/lib/boxes";
import { TierCard } from "@/components/account/tier-badge";
import { customerBookings, driverStatuses, requireCustomer } from "@/lib/customer-auth";
import { tripBucket } from "@/lib/customer-account";

export const metadata: Metadata = { title: "My account · Waydidi", robots: { index: false, follow: false } };

export default async function AccountOverview() {
  const customer = await requireCustomer("/account");
  const trips = (await customerBookings(customer)).map((trip) => ({ trip, bucket: tripBucket(trip.status, trip.pickupDate, trip.pickupTime) }));
  const upcoming = trips.filter((t) => t.bucket === "upcoming").reverse(); // soonest first
  const next = upcoming[0];
  const recent = trips.filter((t) => t !== next).slice(0, 3);
  const statuses = await driverStatuses(next ? [next.trip.reference] : []);
  const loyalty = await loyaltyStatus(customer.id).catch(() => null);
  const tier = await memberTierStatus(customer.id).catch(() => null);
  const gifts = (await listMemberGifts(customer.id).catch(() => [])).filter((g) => g.status === "available");
  const boxes = (await listMemberBoxes(customer.id).catch(() => [])).filter((b) => !b.openedAt);
  const actions = [
    { href: "/#booking-search", label: "Book a ride", icon: CarFront },
    { href: "/account/trips", label: "All my trips", icon: Search },
    { href: "/account/profile", label: "Edit profile", icon: UserRound },
    { href: "/contact", label: "Get help", icon: Headphones },
  ];
  return <AccountShell name={customer.name} email={customer.email}>
    <h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Hi{customer.name ? `, ${customer.name}` : ""}</h1>
    <p className="mt-2 text-slate-600">{upcoming.length ? `You have ${upcoming.length} upcoming ${upcoming.length === 1 ? "trip" : "trips"}.` : "No upcoming trips yet."}</p>

    {tier && <div className="mt-6"><TierCard status={tier} /></div>}
    {boxes.length > 0 && <div className="mt-4"><MysteryBoxes boxes={boxes} /></div>}
    {gifts.length > 0 && <div className="mt-4"><GiftWallet gifts={gifts} /></div>}
    {loyalty && <div className="mt-4"><LoyaltyCard status={loyalty} /></div>}

    <section className="mt-7" aria-labelledby="next-trip">
      <h2 id="next-trip" className="mb-3 text-lg font-black">Next trip</h2>
      {next ? <TripCard trip={next.trip} bucket="upcoming" driverStatus={statuses.get(next.trip.reference)} featured /> : <div className="rounded-[22px] bg-white p-7 text-center"><p className="font-bold">Where are you heading next?</p><p className="mt-1 text-slate-600">Book a private ride and it will appear here.</p><Link href="/#booking-search" className="mt-5 inline-flex rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white">Search rides</Link></div>}
    </section>

    <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Quick actions">
      {actions.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="rounded-[20px] bg-white p-5 font-bold transition hover:shadow-md"><Icon className="text-[#FF8A05]" /><span className="mt-3 block">{label}</span></Link>)}
    </section>

    {recent.length ? <section className="mt-8" aria-labelledby="recent-trips">
      <div className="mb-3 flex items-center justify-between"><h2 id="recent-trips" className="text-lg font-black">Recent trips</h2><Link href="/account/trips" className="text-sm font-black text-[#C96100] hover:underline">See all</Link></div>
      <div className="grid gap-3">{recent.map(({ trip, bucket }) => <TripCard key={trip.reference} trip={trip} bucket={bucket} />)}</div>
    </section> : null}
  </AccountShell>;
}

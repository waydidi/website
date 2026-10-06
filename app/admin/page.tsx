import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { UpcomingRides } from "@/components/admin-overview/upcoming-rides";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminOverview } from "@/lib/admin-overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview · Waydidi operations", robots: { index: false, follow: false } };

const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <p className="text-[13px] font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-[24px] font-black tracking-[-.02em] text-slate-900">{value}</p>
    {sub && <p className="mt-0.5 text-[12px] text-slate-500">{sub}</p>}
  </div>;
}

// Admin home: what needs attention now, upcoming rides, and the key numbers.
export default async function AdminOverviewPage() {
  const access = await requireWaydidiAdmin("/admin");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  if(access.user.role!=="owner" && access.user.role!=="operations") redirect(access.user.role==="finance"?"/admin/payments":access.user.role==="editor"?"/admin/blog":"/admin/chat");
  const o = await adminOverview();

  return <main className="min-h-screen bg-[#F6F7F9] px-4 py-6 text-[#1f1726] sm:px-8">
    <div className="mx-auto grid max-w-[1200px] gap-6">


      {/* Key numbers */}
      <section aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="sr-only">Key numbers</h2>
        {/* Desktop: numbers as 2×2 on the left half, upcoming rides on the right half. */}
        <div className="pt-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Bookings today" value={String(o.stats.today.bookings)} sub={thb(o.stats.today.revenue)} />
          <Stat label="Last 7 days" value={String(o.stats.week.bookings)} sub={`${thb(o.stats.week.revenue)} · ${o.stats.week.cancelled} cancelled`} />
          <Stat label="Last 30 days" value={String(o.stats.month.bookings)} sub={`${thb(o.stats.month.revenue)} · avg ${thb(o.stats.month.average)}`} />
          <Stat label="Cash to collect" value={thb(o.cashDue.amount)} sub={`${o.cashDue.count} upcoming cash ride${o.cashDue.count === 1 ? "" : "s"}`} />
        </div>
        <div className="lg:[&>section]:mt-0"><UpcomingRides rides={o.rides} drivers={o.drivers} /></div>
        </div>
      </section>

      {/* Quick links */}
      <nav aria-label="Quick links" className="flex flex-wrap gap-2 pb-6">
        {[["Bookings", "/admin/bookings"], ["Booking operations", "/admin/operations"], ["Fare management", "/admin/pricing"], ["Promotions", "/admin/promotions"], ["Giveaways", "/admin/gifts"], ["Blog", "/admin/blog"]].map(([l, h]) => <Link key={h} href={h} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold hover:border-[#FF8A05]">{l}</Link>)}
      </nav>
    </div>
  </main>;
}

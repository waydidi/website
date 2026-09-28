import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, CircleAlert, ClipboardList, Gift, IdCard, UserX } from "lucide-react";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { UpcomingRides } from "@/components/admin-overview/upcoming-rides";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminOverview } from "@/lib/admin-overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview · Waydidi operations", robots: { index: false, follow: false } };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
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
  const o = await adminOverview();
  const { alerts } = o;
  const ALERTS = [
    { n: alerts.unassignedSoon, label: plural(alerts.unassignedSoon, "ride", "rides") + " in the next 24h with no driver", href: "/admin/operations", icon: UserX, urgent: true },
    { n: alerts.attention, label: plural(alerts.attention, "booking", "bookings") + " flagged as needing attention", href: "/admin/operations", icon: AlertTriangle, urgent: true },
    { n: alerts.operationsAlerts, label: "open operations " + plural(alerts.operationsAlerts, "alert", "alerts"), href: "/admin/operations", icon: CircleAlert, urgent: true },
    { n: alerts.changeRequests, label: plural(alerts.changeRequests, "change request", "change requests") + " waiting", href: "/admin/bookings", icon: ClipboardList, urgent: false },
    { n: alerts.ticketsToArrange, label: "partner " + plural(alerts.ticketsToArrange, "ticket", "tickets") + " to arrange", href: "/admin/gifts/mystery", icon: Gift, urgent: false },
    { n: alerts.agencyApplications, label: "new agency " + plural(alerts.agencyApplications, "application", "applications"), href: "/admin/agencies", icon: Building2, urgent: false },
    { n: alerts.driverApplications, label: "new driver " + plural(alerts.driverApplications, "application", "applications"), href: "/admin/drivers?tab=applications", icon: IdCard, urgent: false },
  ].filter((a) => a.n > 0);

  return <main className="min-h-screen bg-[#F6F7F9] px-4 py-6 text-[#1f1726] sm:px-8">
    <div className="mx-auto grid max-w-[1200px] gap-6">

      {/* Alerts: only shown when something is waiting. */}
      {ALERTS.length > 0 && <section aria-label="Needs attention" className="pt-2">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ALERTS.map(({ n, label, href, icon: Icon, urgent }) => <li key={label}>
          <Link href={href} className={`flex items-center gap-3 rounded-2xl border p-4 ${urgent ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <Icon size={20} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[14px]"><strong className="text-[18px]">{n}</strong> {label}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </li>)}</ul>
      </section>}

      {/* Key numbers */}
      <section aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="sr-only">Key numbers</h2>
        <div className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
          <Stat label="Bookings today" value={String(o.stats.today.bookings)} sub={thb(o.stats.today.revenue)} />
          <Stat label="Last 7 days" value={String(o.stats.week.bookings)} sub={`${thb(o.stats.week.revenue)} · ${o.stats.week.cancelled} cancelled`} />
          <Stat label="Last 30 days" value={String(o.stats.month.bookings)} sub={`${thb(o.stats.month.revenue)} · avg ${thb(o.stats.month.average)}`} />
          <Stat label="Cash to collect" value={thb(o.cashDue.amount)} sub={`${o.cashDue.count} upcoming cash ride${o.cashDue.count === 1 ? "" : "s"}`} />
        </div>
        <UpcomingRides rides={o.rides} drivers={o.drivers} />
      </section>

      {/* Quick links */}
      <nav aria-label="Quick links" className="flex flex-wrap gap-2 pb-6">
        {[["Bookings", "/admin/bookings"], ["Booking operations", "/admin/operations"], ["Fare management", "/admin/pricing"], ["Promotions", "/admin/promotions"], ["Giveaways", "/admin/gifts"], ["Blog", "/admin/blog"]].map(([l, h]) => <Link key={h} href={h} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold hover:border-[#FF8A05]">{l}</Link>)}
      </nav>
    </div>
  </main>;
}

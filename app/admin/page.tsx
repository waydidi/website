import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, CircleAlert, ClipboardList, Gift, IdCard, UserX } from "lucide-react";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { RevenueChart } from "@/components/admin-overview/revenue-chart";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminOverview, type OverviewRide } from "@/lib/admin-overview";
import { VEHICLES } from "@/lib/vehicles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview · Waydidi operations", robots: { index: false, follow: false } };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <p className="text-[13px] font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-[24px] font-black tracking-[-.02em] text-slate-900">{value}</p>
    {sub && <p className="mt-0.5 text-[12px] text-slate-500">{sub}</p>}
  </div>;
}

function RideRow({ r }: { r: OverviewRide }) {
  const vehicle = (VEHICLES as Record<string, { name: string }>)[r.vehicle]?.name ?? r.vehicle;
  return <li>
    <Link href={`/admin/journeys/${encodeURIComponent(r.reference)}`} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 hover:border-[#FF8A05] sm:grid-cols-[70px_minmax(0,1fr)_auto] sm:items-center">
      <p className="text-[20px] font-black">{r.pickupTime}</p>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold">{r.pickup} → {r.dropoff}</p>
        <p className="truncate text-[13px] text-slate-500">{r.reference} · {r.name} · {vehicle} · {r.paymentMethod === "cash" ? `Cash ${thb(r.total)}` : thb(r.total)}{r.flightNumber ? ` · ✈ ${r.flightNumber}${r.flightStatus ? ` (${r.flightStatus})` : ""}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {r.status === "pending_payment" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-bold text-amber-800">Awaiting payment</span>}
        {r.attention && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[12px] font-bold text-red-800"><AlertTriangle size={12} aria-hidden="true" />Needs attention</span>}
        {r.driver
          ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-800">✓ {r.driver}{r.driverStatus && r.driverStatus !== "assigned" ? ` · ${r.driverStatus.replaceAll("_", " ")}` : ""}</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[12px] font-bold text-white"><UserX size={12} aria-hidden="true" />No driver</span>}
      </div>
    </Link>
  </li>;
}

// Admin home: what needs attention now, today's and tomorrow's rides, and the key numbers.
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
    { n: alerts.ticketsToArrange, label: "partner " + plural(alerts.ticketsToArrange, "ticket", "tickets") + " to arrange", href: "/admin/gifts", icon: Gift, urgent: false },
    { n: alerts.agencyApplications, label: "new agency " + plural(alerts.agencyApplications, "application", "applications"), href: "/admin/agencies", icon: Building2, urgent: false },
    { n: alerts.driverApplications, label: "new driver " + plural(alerts.driverApplications, "application", "applications"), href: "/admin/driver-applications", icon: IdCard, urgent: false },
  ].filter((a) => a.n > 0);
  const todayRides = o.rides.filter((r) => r.pickupDate === o.today);
  const tomorrowRides = o.rides.filter((r) => r.pickupDate === o.tomorrow);

  return <main className="min-h-screen bg-[#F6F7F9] px-4 py-6 text-[#1f1726] sm:px-8">
    <div className="mx-auto grid max-w-[1200px] gap-6">

      {/* Needs attention */}
      <section aria-labelledby="alerts-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2"><h2 id="alerts-heading" className="text-[17px] font-black">Needs attention</h2><p className="text-[13px] font-semibold text-slate-500">{dayName(o.today)} · Bangkok time</p></div>
        {ALERTS.length === 0
          ? <p className="mt-2 rounded-2xl bg-emerald-50 p-4 text-[14px] font-semibold text-emerald-800">✓ All clear. Nothing is waiting for you right now.</p>
          : <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ALERTS.map(({ n, label, href, icon: Icon, urgent }) => <li key={label}>
            <Link href={href} className={`flex items-center gap-3 rounded-2xl border p-4 ${urgent ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <Icon size={20} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[14px]"><strong className="text-[18px]">{n}</strong> {label}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>)}</ul>}
      </section>

      {/* Key numbers */}
      <section aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="text-[17px] font-black">Key numbers</h2>
        <p className="text-[12px] text-slate-500">By the day bookings were made. Revenue counts confirmed and completed bookings.</p>
        <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Bookings today" value={String(o.stats.today.bookings)} sub={thb(o.stats.today.revenue)} />
          <Stat label="Last 7 days" value={String(o.stats.week.bookings)} sub={`${thb(o.stats.week.revenue)} · ${o.stats.week.cancelled} cancelled`} />
          <Stat label="Last 30 days" value={String(o.stats.month.bookings)} sub={`${thb(o.stats.month.revenue)} · avg ${thb(o.stats.month.average)}`} />
          <Stat label="Cash to collect" value={thb(o.cashDue.amount)} sub={`${o.cashDue.count} upcoming cash ride${o.cashDue.count === 1 ? "" : "s"}`} />
        </div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[14px] font-bold">Revenue per day, last 30 days</p>
          <div className="mt-2"><RevenueChart data={o.trend} /></div>
        </div>
      </section>

      {/* Rides */}
      {[["Today", o.today, todayRides], ["Tomorrow", o.tomorrow, tomorrowRides]].map(([title, day, rides]) => <section key={title as string} aria-labelledby={`rides-${title}`}>
        <div className="flex items-baseline justify-between">
          <h2 id={`rides-${title}`} className="flex items-center gap-2 text-[17px] font-black"><CalendarClock size={18} aria-hidden="true" />{title as string} <span className="text-[13px] font-semibold text-slate-500">{dayName(day as string)} · {(rides as OverviewRide[]).length} ride{(rides as OverviewRide[]).length === 1 ? "" : "s"}</span></h2>
          <Link href="/admin/calendar" className="text-[13px] font-bold text-[#C96100]">Calendar →</Link>
        </div>
        {(rides as OverviewRide[]).length === 0
          ? <p className="mt-2 rounded-2xl bg-white p-4 text-[14px] text-slate-500">No rides.</p>
          : <ul className="mt-2 grid gap-2">{(rides as OverviewRide[]).map((r) => <RideRow key={r.reference} r={r} />)}</ul>}
      </section>)}

      {/* Quick links */}
      <nav aria-label="Quick links" className="flex flex-wrap gap-2 pb-6">
        {[["Bookings", "/admin/bookings"], ["Booking operations", "/admin/operations"], ["Fare management", "/admin/pricing"], ["Promotions", "/admin/promotions"], ["Member gifts", "/admin/gifts"], ["Blog", "/admin/blog"]].map(([l, h]) => <Link key={h} href={h} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold hover:border-[#FF8A05]">{l}</Link>)}
      </nav>
    </div>
  </main>;
}

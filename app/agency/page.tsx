import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { NewRideRequest } from "@/components/agency/new-request";
import { agencyBookings, agencyForCustomer, agencyRequests } from "@/lib/agency";
import { requireCustomer } from "@/lib/customer-auth";
import { agencyTripStats } from "@/lib/smart-trips";
import { VEHICLES } from "@/lib/vehicles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agency portal · Waydidi", robots: { index: false, follow: false } };

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const vehicleName = (v: string) => VEHICLES[v as keyof typeof VEHICLES]?.name ?? v;
const niceDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function StatusPill({ status, past }: { status: string; past: boolean }) {
  const [text, cls] = status === "cancelled" ? ["Cancelled", "bg-slate-200 text-slate-600"]
    : status === "completed" || past ? ["Completed", "bg-sky-100 text-sky-800"]
    : status === "confirmed" ? ["Confirmed", "bg-emerald-100 text-emerald-800"] : ["Pending", "bg-amber-100 text-amber-800"];
  return <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${cls}`}>{text}</span>;
}

// Travel agency portal: the agency's bookings, confirmations and new ride requests.
export default async function AgencyPortalPage() {
  const customer = await requireCustomer("/agency");
  const agency = await agencyForCustomer(customer);
  if (!agency) return <main className="grid min-h-[70vh] place-items-center bg-[#F5F6F8] px-5">
    <div className="max-w-md rounded-[24px] bg-white p-8 text-center">
      <h1 className="text-[26px] font-bold">Agency portal</h1>
      <p className="mt-3 text-slate-600"><b>{customer.email}</b> isn&apos;t linked to an approved agency account yet. Sign in with the email you used to apply, or <Link href="/agencies" className="font-semibold text-[#D96F00] underline">apply as a partner</Link>.</p>
    </div>
  </main>;

  const [rows, requests, tripStats] = await Promise.all([agencyBookings(agency), agencyRequests(agency), agencyTripStats(agency.id)]);
  const today = bangkokToday();
  const upcoming = rows.filter((b) => b.pickupDate >= today && b.status === "confirmed");
  const month = today.slice(0, 7);
  const thisMonth = rows.filter((b) => b.pickupDate.startsWith(month) && b.status !== "cancelled");
  const spend = thisMonth.reduce((sum, b) => sum + b.total, 0);

  return <main className="min-h-screen bg-[#F5F6F8] text-[#211726]">
    <div className="mx-auto grid max-w-[1180px] gap-6 px-5 pb-24 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[13px] font-semibold uppercase tracking-[.14em] text-[#D96F00]">Agency portal</p><h1 className="text-[32px] font-bold leading-tight">{agency.agencyName}</h1><p className="text-slate-600">Signed in as {customer.email}</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/agency/trips" className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 font-semibold text-[#211726] hover:border-[#FF8A05]">Plan a day trip</Link><NewRideRequest /></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[["Upcoming rides", String(upcoming.length)], ["Rides this month", String(thisMonth.length)], ["Ride value this month", `THB ${spend.toLocaleString("en-US")}`]].map(([k, v]) =>
          <div key={k} className="rounded-[20px] bg-white p-5"><p className="text-[14px] text-slate-500">{k}</p><p className="mt-1 text-[28px] font-bold">{v}</p></div>)}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-white p-5">
        <div><h2 className="text-[20px] font-semibold">Day trips</h2><p className="text-[14px] text-slate-600">Plan private day trips with Waydidi&apos;s attraction guide and earn commission when your guest pays.</p></div>
        <div className="flex flex-wrap gap-6 text-center">
          {[["Open", String(tripStats.open)], ["Paid", String(tripStats.paid)], ["Commission earned", `THB ${tripStats.commission.toLocaleString("en-US")}`]].map(([k, v]) => <div key={k}><p className="text-[13px] text-slate-500">{k}</p><p className="text-[22px] font-bold">{v}</p></div>)}
        </div>
        <Link href="/agency/trips" className="inline-flex h-11 items-center rounded-full bg-[#FF8A05] px-5 font-semibold text-white">Open trip planner</Link>
      </section>

      {requests.length > 0 && <section className="rounded-[24px] bg-white p-5">
        <h2 className="text-[20px] font-semibold">Requests in progress</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {requests.map((r) => {
            const a = r.answers ? JSON.parse(r.answers) as { name: string; pickup: string; dropoff?: string; date: string; time: string } : null;
            return <li key={r.token} className="flex flex-wrap items-center gap-3 py-3">
              <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${r.status === "submitted" ? "bg-orange-100 text-orange-800" : "bg-sky-100 text-sky-800"}`}>{r.status === "submitted" ? "Waiting for confirmation" : "Not filled in yet"}</span>
              <span className="font-medium">{a ? `${a.name} · ${a.pickup}${a.dropoff ? ` → ${a.dropoff}` : ""} · ${a.date} ${a.time}` : r.note ?? "New request"}</span>
              {r.status === "waiting" && <a href={`/f/${r.token}`} className="ml-auto text-[14px] font-semibold text-[#D96F00] hover:underline">Fill in</a>}
            </li>;
          })}
        </ul>
      </section>}

      <section className="overflow-hidden rounded-[24px] bg-white">
        <h2 className="px-5 pt-5 text-[20px] font-semibold">Your bookings</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[820px] text-left text-[14px]">
            <thead className="bg-slate-50 text-slate-500"><tr>{["Reference", "Date & time", "Passenger", "Route", "Car", "Status", "Total", ""].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500">No bookings yet. Tap “New ride request” to send us your first ride.</td></tr>}
              {rows.map((b) => <tr key={b.reference} className="border-t border-slate-100">
                <td className="px-5 py-3 font-semibold">{b.reference}</td>
                <td className="whitespace-nowrap px-5">{niceDate(b.pickupDate)}<span className="block text-[13px] text-slate-500">{b.pickupTime}</span></td>
                <td className="px-5">{b.customerName}</td>
                <td className="max-w-[260px] px-5"><span className="line-clamp-2">{b.pickup}{b.dropoff ? ` → ${b.dropoff}` : ""}</span></td>
                <td className="px-5">{vehicleName(b.vehicle)}</td>
                <td className="px-5"><StatusPill status={b.status} past={b.pickupDate < today} /></td>
                <td className="whitespace-nowrap px-5 font-medium">THB {b.total.toLocaleString("en-US")}</td>
                <td className="px-5">{(b.status === "confirmed" || b.status === "completed") && <a href={`/api/agency/bookings/${b.reference}/pdf`} aria-label={`Download PDF for ${b.reference}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 font-medium hover:border-[#FF8A05]"><Download size={15} />PDF</a>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>;
}

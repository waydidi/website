import { desc, isNull } from "drizzle-orm";
import {
  BookOpen,
  CalendarDays,
  MapPinned,
  Truck,
  List,
  Columns3,
} from "lucide-react";
import { getDb } from "@/db";
import { bookingAssignments, bookings, bookingTaxInvoices, drivers } from "@/db/schema";
import { DriverPicker } from "@/components/bookings-admin/driver-picker";
import { requireWaydidiAdmin } from "@/lib/admin";
import type { Metadata } from "next";
import Link from "next/link";
import { NotionCalendar } from "@/components/bookings-admin/notion-calendar";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PaymentReconciliationButton } from "@/components/payment-reconciliation-button";
import { backfillUnifiedPaymentFields } from "@/lib/payment-backfill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bookings · Waydidi operations",
  robots: { index: false, follow: false },
};

export default async function BookingAdminPage({ searchParams }: { searchParams: Promise<{ view?: string; type?: string; mode?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/bookings");
  if (!access.authorized) {
    return <AdminKeyLogin configured={access.configured} />;
  }
  const q = await searchParams;
  const view = q.view === "bin" ? "bin" : "active";
  const type = q.type === "hourly" ? "hourly" : q.type === "tour" ? "tour" : "transfer";
  const mode = q.mode === "calendar" ? "calendar" : q.mode === "board" ? "board" : "list";
  await backfillUnifiedPaymentFields();

  const allRows = await getDb()
    .select()
    .from(bookings)
    .orderBy(desc(bookings.createdAt))
    .limit(100);
  // Tax invoice requests (the table may not exist yet before its migration runs).
  const taxRows = await getDb().select().from(bookingTaxInvoices).limit(500).catch(() => []);
  const taxByBooking = new Map(taxRows.map((tax) => [tax.bookingReference, tax]));
  const binRows = allRows.filter((row) => row.status === "binned");
  const activeRows = allRows.filter((row) => row.status !== "binned");
  const [driverRows, assignmentRows] = await Promise.all([
    getDb().select({ id: drivers.id, name: drivers.fullName, phone: drivers.phone, email: drivers.email, area: drivers.baseLocation, vehicle: drivers.vehicle, status: drivers.status }).from(drivers),
    getDb().select({ ref: bookingAssignments.bookingReference, driverId: bookingAssignments.driverId }).from(bookingAssignments).where(isNull(bookingAssignments.revokedAt)),
  ]);
  const driverOptions = driverRows.filter((d) => d.status === "active").map((d) => ({ id: d.id, name: d.name, phone: d.phone, email: d.email, area: d.area, vehicle: d.vehicle }));
  const assigned = new Map(assignmentRows.map((a) => [a.ref, a.driverId]));
  const rows = (view === "bin" ? binRows : activeRows).filter((row) => (row.serviceType ?? "transfer") === type);
  const confirmed = activeRows.filter((row) => row.status === "confirmed").length;
  const pending = activeRows.filter((row) => row.status === "pending_payment").length;
  const emailIssues = activeRows.filter(
    (row) => row.status === "confirmed" && row.emailStatus !== "sent",
  ).length;
  const pendingRefunds = activeRows.filter((row) => row.refundStatus === "awaiting_approval").length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-[#1f1726] sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <a
              href="/"
              className="mb-6 inline-flex text-[#FF8A05]"
              aria-label="Waydidi home"
            >
              <WaydidiLogo className="h-[88px] w-auto" />
            </a>
            <p className="text-sm font-black uppercase tracking-[.16em] text-[#D96F00]">
              Waydidi operations
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.04em]">
              Bookings
            </h1>
            <p className="mt-2 text-slate-500">
              {view === "bin" ? "Bookings are permanently deleted 30 days after they enter the bin." : `Latest 100 bookings · signed in as ${access.user.email}`}
            </p>
          </div>
          <div className="flex gap-2 text-sm font-bold">
            <PaymentReconciliationButton auto={pending > 0} />
            <span className="rounded-full bg-emerald-100 px-4 py-2 text-emerald-800">
              {confirmed} confirmed
            </span>
            <span className="rounded-full bg-amber-100 px-4 py-2 text-amber-900">
              {pending} pending
            </span>
            {pendingRefunds > 0 && (
              <span className="rounded-full bg-orange-100 px-4 py-2 text-[#B85D00]">
                {pendingRefunds} refund approval{pendingRefunds === 1 ? "" : "s"}
              </span>
            )}
            {emailIssues > 0 && (
              <span className="rounded-full bg-red-100 px-4 py-2 text-red-800">
                {emailIssues} email issues
              </span>
            )}
          </div>
        </header>
        <nav className="mt-7 flex w-fit gap-1 rounded-2xl border border-slate-200 bg-white p-1 text-sm font-bold shadow-sm">
          <a
            href="/admin/calendar"
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"
          >
            <CalendarDays size={17} />
            Calendar
          </a>
          <a
            href="/admin/bookings"
            className="flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-3 text-[#D96F00]"
          >
            <BookOpen size={17} />
            Bookings
          </a>
          <a
            href="/admin/operations"
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"
          >
            <Truck size={17} />
            Booking operations
          </a>
          <a
            href="/admin/pricing"
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"
          >
            <MapPinned size={17} />
            Pricing areas
          </a>
        </nav>
        {/* Transfer / By the hour, each with a list or calendar view. */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Service" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
            {([["transfer", "Transfer"], ["hourly", "By the hour"], ["tour", "Tour"]] as const).map(([id, label]) => <Link key={id} role="tab" aria-selected={type === id} href={`/admin/bookings?type=${id}&mode=${mode}`} className={`h-9 rounded-lg px-4 text-[15px] leading-9 ${type === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}>{label}</Link>)}
          </div>
          <div role="tablist" aria-label="View" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
            {([["list", "List", List], ["calendar", "Calendar", CalendarDays], ["board", "Board", Columns3]] as const).map(([id, label, Icon]) => <Link key={id} role="tab" aria-selected={mode === id} href={`/admin/bookings?type=${type}&mode=${id}`} className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[15px] ${mode === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}><Icon size={16} />{label}</Link>)}
          </div>
        </div>
        {mode !== "list" ? <NotionCalendar serviceType={type} view={mode === "board" ? "board" : "calendar"} /> :
        <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>{["Reference ID", "Customer name", "Date & time", "From", "To", "Vehicle", "Payment", "Driver"].map((h) => <th key={h} className="h-14 whitespace-nowrap px-4 text-[14px] font-normal">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const paid = row.paymentStatus === "paid";
                  const cash = !paid && row.paymentMethod === "cash";
                  const tax = taxByBooking.get(row.reference);
                  return <tr key={row.reference} className="align-middle hover:bg-orange-50/40">
                    <td className="px-4 py-4"><Link href={`/admin/journeys/${encodeURIComponent(row.reference)}`} className="font-semibold text-slate-900 hover:text-[#C96100]">{row.reference}</Link>{row.status !== "confirmed" && <p className="mt-0.5 text-[12px] capitalize text-slate-500">{row.status.replaceAll("_", " ")}</p>}</td>
                    <td className="px-4 py-4"><p className="font-medium text-slate-900">{row.customerName}</p><p className="text-[12px] text-slate-500">{row.customerPhone}</p>{tax && <p className="mt-1 text-[12px] font-medium text-amber-700">Tax invoice requested</p>}</td>
                    <td className="whitespace-nowrap px-4 py-4"><p className="text-slate-900">{new Date(`${row.pickupDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p><p className="text-[12px] text-slate-500">{row.pickupTime}{row.returnDate && row.returnTime ? ` · return ${row.returnDate} ${row.returnTime}` : ""}</p></td>
                    <td className="max-w-[180px] px-4 py-4"><p className="line-clamp-2 text-slate-900">{row.pickup}</p></td>
                    <td className="max-w-[180px] px-4 py-4"><p className="line-clamp-2 text-slate-900">{row.serviceType === "hourly" ? `${row.bookedHours ?? ""} hours` : row.dropoff}</p></td>
                    <td className="px-4 py-4"><p className="text-slate-900">{row.vehicle.replaceAll("_", " ")}</p><p className="text-[12px] text-slate-500">{row.passengers} people · {row.luggage} bags</p></td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {paid ? <span className="inline-flex rounded-full bg-[#06C755] px-2.5 py-0.5 text-[13px] font-medium text-white">Paid</span>
                        : cash ? <span className="inline-flex rounded-full bg-[#E53935] px-2.5 py-0.5 text-[13px] font-medium text-white">Pay in cash</span>
                        : <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[13px] font-medium text-slate-700">{row.paymentStatus.replaceAll("_", " ")}</span>}
                      <p className="mt-1 text-[12px] text-slate-500">฿{row.total.toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-4"><DriverPicker reference={row.reference} drivers={driverOptions} current={assigned.get(row.reference) ?? null} canAssign={row.status === "confirmed"} /></td>
                  </tr>;
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-slate-500">
                      {type === "tour" ? "No tour bookings yet." : type === "hourly" ? "No hourly bookings yet." : "No bookings yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>}
      </div>
    </main>
  );
}

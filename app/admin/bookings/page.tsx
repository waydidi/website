import { desc } from "drizzle-orm";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  MapPinned,
  Truck,
  XCircle,
  List,
} from "lucide-react";
import { getDb } from "@/db";
import { bookings, bookingTaxInvoices } from "@/db/schema";
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

const statusStyle: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  pending_payment: "bg-amber-100 text-amber-900",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
  binned: "bg-slate-200 text-slate-700",
  expired: "bg-slate-200 text-slate-700",
};

export default async function BookingAdminPage({ searchParams }: { searchParams: Promise<{ view?: string; type?: string; mode?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/bookings");
  if (!access.authorized) {
    return <AdminKeyLogin configured={access.configured} />;
  }
  const q = await searchParams;
  const view = q.view === "bin" ? "bin" : "active";
  const type = q.type === "hourly" ? "hourly" : q.type === "tour" ? "tour" : "transfer";
  const mode = q.mode === "calendar" ? "calendar" : "list";
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
            {([["list", "List", List], ["calendar", "Calendar", CalendarDays]] as const).map(([id, label, Icon]) => <Link key={id} role="tab" aria-selected={mode === id} href={`/admin/bookings?type=${type}&mode=${id}`} className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[15px] ${mode === id ? "bg-white font-medium text-[#15161C] shadow-sm" : "text-slate-600 hover:text-[#15161C]"}`}><Icon size={16} />{label}</Link>)}
          </div>
        </div>
        {mode === "calendar" ? <NotionCalendar serviceType={type} /> :
        <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Reference</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Pickup</th>
                  <th className="px-5 py-4">Vehicle</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr
                    key={row.reference}
                    className="align-top hover:bg-orange-50/40"
                  >
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusStyle[row.status] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-black">
                      {row.reference}
                      <p className="mt-1 text-xs font-normal text-slate-400">
                        {new Date(row.createdAt).toLocaleString("en-GB", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {row.customerName}
                      <p className="mt-1 font-normal text-slate-500">
                        {row.customerEmail}
                      </p>
                      <p className="font-normal text-slate-500">
                        {row.customerPhone}
                      </p>
                      {taxByBooking.get(row.reference) && (() => { const tax = taxByBooking.get(row.reference)!; return (
                        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-normal text-amber-900">
                          <p className="font-bold">Tax invoice requested</p>
                          <p>{tax.name} · Tax ID {tax.taxId} · {tax.branch}</p>
                          <p className="whitespace-pre-line">{tax.address}</p>
                        </div>
                      ); })()}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {row.pickupDate}
                      <p className="mt-1 font-normal text-slate-500">
                        {row.pickupTime}
                      </p>
                      {row.returnDate && row.returnTime && (
                        <p className="mt-2 text-xs font-bold text-[#B85E00]">
                          Return {row.returnDate} · {row.returnTime}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {row.vehicle}
                      <p className="mt-1 text-slate-500">
                        {row.passengers} people · {row.luggage} bags
                      </p>
                    </td>
                    <td className="px-5 py-4 font-black">
                      ฿{row.total.toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      {row.emailStatus === "sent" ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                          <CheckCircle2 size={16} /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-bold text-amber-800">
                          {row.status === "cancelled" ? (
                            <XCircle size={16} />
                          ) : row.status === "pending_payment" ? (
                            <Clock3 size={16} />
                          ) : (
                            <Mail size={16} />
                          )}{" "}
                          {row.emailStatus.replaceAll("_", " ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-16 text-center text-slate-500"
                    >
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

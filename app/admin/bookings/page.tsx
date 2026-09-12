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
} from "lucide-react";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";
import type { Metadata } from "next";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { RefundActions } from "@/components/refund-actions";

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
};

export default async function BookingAdminPage() {
  const access = await requireWaydidiAdmin("/admin/bookings");
  if (!access.authorized) {
    return <AdminKeyLogin configured={access.configured} />;
  }

  const rows = await getDb()
    .select()
    .from(bookings)
    .orderBy(desc(bookings.createdAt))
    .limit(100);
  const confirmed = rows.filter((row) => row.status === "confirmed").length;
  const pending = rows.filter((row) => row.status === "pending_payment").length;
  const emailIssues = rows.filter(
    (row) => row.status === "confirmed" && row.emailStatus !== "sent",
  ).length;
  const pendingRefunds = rows.filter((row) => row.refundStatus === "awaiting_approval").length;

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
              <WaydidiLogo className="h-20 w-auto" />
            </a>
            <p className="text-sm font-black uppercase tracking-[.16em] text-[#D96F00]">
              Waydidi operations
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.04em]">
              Bookings
            </h1>
            <p className="mt-2 text-slate-500">
              Latest 100 bookings · signed in as {access.user.email}
            </p>
          </div>
          <div className="flex gap-2 text-sm font-bold">
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
        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Reference</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Journey</th>
                  <th className="px-5 py-4">Pickup</th>
                  <th className="px-5 py-4">Vehicle</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Refund</th>
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
                    </td>
                    <td className="max-w-[300px] px-5 py-4">
                      <p className="font-bold">{row.pickup}</p>
                      <p className="mt-1 text-slate-500">to {row.dropoff}</p>
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {row.pickupDate}
                      <p className="mt-1 font-normal text-slate-500">
                        {row.pickupTime}
                      </p>
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
                      {row.refundStatus === "awaiting_approval" ? (
                        <div className="space-y-3">
                          <div>
                            <span className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-[#B85D00]">Awaiting approval</span>
                            <p className="mt-2 max-w-64 text-xs leading-5 text-slate-500">{row.cancellationReason}</p>
                            <p className="mt-1 text-xs font-bold">฿{(row.refundAmount ?? row.total).toLocaleString()}</p>
                          </div>
                          <RefundActions reference={row.reference} />
                        </div>
                      ) : row.refundStatus ? (
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${row.refundStatus === "succeeded" ? "bg-emerald-100 text-emerald-800" : row.refundStatus === "declined" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{row.refundStatus.replaceAll("_", " ")}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
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
                      colSpan={9}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      No bookings yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

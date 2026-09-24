import type { Metadata } from "next";
import Link from "next/link";
import { Download, ReceiptText } from "lucide-react";
import { AccountShell, formatTripDate, PageTitle } from "@/components/account/account-shell";
import { customerBookings, requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Receipts · Waydidi", robots: { index: false, follow: false } };

const paymentLabel: Record<string, string> = { paid: "Paid", cash_due: "Cash to driver", pending: "Awaiting payment", refunded: "Refunded", partially_refunded: "Partly refunded", failed: "Payment failed" };
const label = (value: string | null | undefined) => (value ? paymentLabel[value] ?? value.replace(/_/g, " ") : "");

export default async function ReceiptsPage() {
  const customer = await requireCustomer("/account/receipts");
  const trips = await customerBookings(customer);
  const year = new Date().getFullYear().toString();
  const paidThisYear = trips.filter((t) => t.status !== "cancelled" && t.paymentStatus === "paid" && t.createdAt.startsWith(year)).reduce((sum, t) => sum + t.total, 0);
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Receipts" subtitle="Payments for your trips. Download a PDF for your records or expense claims." />
    <div className="mb-5 rounded-[20px] bg-white p-5"><p className="text-sm text-slate-500">Paid by card in {year}</p><p className="mt-1 text-2xl font-black">฿{paidThisYear.toLocaleString()}</p></div>
    {trips.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">{trips.map((trip) => {
      const hasPdf = trip.status === "confirmed" || trip.status === "completed";
      return <li key={trip.reference} className="flex flex-col gap-4 rounded-[20px] bg-white p-5 sm:flex-row sm:items-center">
        <span className="hidden size-11 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00] sm:grid"><ReceiptText size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold"><Link href={`/account/trips/${trip.reference}`} className="hover:underline">{trip.reference}</Link> <span className="font-normal text-slate-500">· {formatTripDate(trip.pickupDate, trip.pickupTime)}</span></p>
          <p className="truncate text-sm text-slate-600">{trip.pickup} → {trip.serviceType === "hourly" ? "Hourly driver" : trip.dropoff}</p>
          <p className="mt-1 text-sm"><span className="font-bold">฿{trip.total.toLocaleString()}</span> · {trip.paymentMethod === "cash" ? "Cash" : "Card"} · <span className={trip.paymentStatus === "paid" ? "text-emerald-700" : "text-slate-600"}>{label(trip.paymentStatus)}</span>{trip.status === "cancelled" ? <span className="text-red-700"> · Cancelled{trip.refundStatus ? `, refund ${trip.refundStatus.replace(/_/g, " ")}` : ""}</span> : null}</p>
        </div>
        {hasPdf ? <a href={`/api/account/trips/${trip.reference}/pdf`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-bold hover:border-[#FF8A05]"><Download size={16} />PDF</a> : null}
      </li>;
    })}</ul> : <div className="rounded-[20px] bg-white p-8 text-center text-slate-600">No receipts yet. They appear here after you book.</div>}
  </AccountShell>;
}

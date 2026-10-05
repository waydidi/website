import type { Metadata } from "next";
import { chatPaymentLink, chatPaymentTestMode, paysoConfigured, type Details } from "@/lib/chat-pay";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
import { ChatPayButton } from "./pay-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay for your booking · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ChatPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await chatPaymentLink(id);
  const box = "rounded-2xl border border-slate-200 bg-white p-5";
  if (!link) return <main className="font-home min-h-dvh bg-[#F6F7F9] px-4 pt-10"><div className={`${box} mx-auto max-w-[520px]`}><h1 className="text-[22px] font-bold">Payment link not found</h1><p className="mt-2 text-slate-600">Please ask in the chat for a new link.</p></div></main>;
  const d = JSON.parse(link.details_json) as Details;
  const car = VEHICLES[link.vehicle as VehicleId]?.name ?? link.vehicle;
  return <main className="font-home min-h-dvh bg-[#F6F7F9] px-4 pb-16 pt-6 text-[#1C1C1C]">
    <div className="mx-auto grid max-w-[520px] gap-4">
      <h1 className="text-[26px] font-bold tracking-[-.02em]">Pay for your booking</h1>
      <section className={box}>
        <dl className="grid gap-2.5 text-[15px]">
          {[["From", d.pickup], [d.hours ? "Service" : "To", d.dropoff], ["Date", d.date], ["Pickup time", d.time], ["Passengers", `${d.passengers} people, ${d.bags} bags`], ["Car", car], ["Lead passenger", `${link.customer_name} · ${link.customer_phone}`]].map(([k, v]) =>
            <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4"><span className="font-semibold">Total</span><span className="text-[24px] font-bold">THB {link.amount.toLocaleString("en-US")}</span></div>
        <p className="mt-1 text-[13px] text-slate-500">Private car, price per car. Tolls as shown on our booking page are included.</p>
      </section>
      {link.status === "paid" ? <p className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800">Paid. Your booking {link.booking_reference} is confirmed. You can close this page.</p>
        : link.status !== "pending" ? <p className="rounded-2xl bg-amber-50 p-4 font-semibold text-amber-900">This link has expired. Reply in the chat and we&apos;ll send a new one.</p>
        : <ChatPayButton id={link.id} live={paysoConfigured()} test={chatPaymentTestMode()} expiresAt={link.expires_at} />}
      <p className="text-center text-[12.5px] text-slate-500">Secure payment by Pay Solutions. Never share card details in the chat.</p>
    </div>
  </main>;
}

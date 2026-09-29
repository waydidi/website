import type { Metadata } from "next";
import { PayForm } from "./pay-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay for your ride · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PayPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ token?: string; session_id?: string }> }) {
  const [{ reference }, q] = await Promise.all([params, searchParams]);
  return <main className="font-home min-h-dvh bg-[#F6F7F9] px-4 pb-16 pt-6 text-[#1C1C1C]">
    <div className="mx-auto max-w-[560px]">
      <h1 className="text-[26px] font-bold tracking-[-.02em]">Pay for your ride</h1>
      <p className="mt-1 text-[15px] text-[#6B6B6B]">Booking {reference.toUpperCase()} · secure payment by Stripe</p>
      <PayForm reference={reference.toUpperCase()} token={q.token ?? ""} sessionId={q.session_id ?? ""} />
    </div>
  </main>;
}

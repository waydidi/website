import Link from "next/link";
import { Gift } from "lucide-react";
import { LOYALTY_CAP, LOYALTY_EVERY, LOYALTY_PERCENT } from "@/lib/loyalty-rules";

// Progress towards the every-5th-ride reward.
export function LoyaltyCard({ status }: { status: { completed: number; eligible: boolean; inCycle: number } }) {
  const filled = status.eligible ? LOYALTY_EVERY - 1 : status.inCycle;
  return <section className="rounded-[20px] bg-white p-5" aria-label="Ride reward">
    <div className="flex items-start gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><Gift size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{status.eligible ? `Your next ride is ${LOYALTY_PERCENT}% off` : `Every ${LOYALTY_EVERY}th ride is ${LOYALTY_PERCENT}% off`}</p>
        <p className="mt-1 text-sm text-slate-600">{status.eligible
          ? `Applied automatically at checkout, up to THB ${LOYALTY_CAP}.`
          : `${LOYALTY_EVERY - 1 - filled === 0 ? "One more" : LOYALTY_EVERY - 1 - filled} completed ride${LOYALTY_EVERY - 1 - filled === 1 ? "" : "s"} to go, then your next booking gets ${LOYALTY_PERCENT}% off (up to THB ${LOYALTY_CAP}).`}</p>
        <ol className="mt-3 flex gap-1.5" aria-label={`${filled} of ${LOYALTY_EVERY - 1} rides completed`}>
          {Array.from({ length: LOYALTY_EVERY }, (_, i) => <li key={i} className={`h-2 flex-1 rounded-full ${i < filled ? "bg-[#FF8A05]" : i === LOYALTY_EVERY - 1 ? (status.eligible ? "bg-emerald-500" : "bg-emerald-100") : "bg-slate-200"}`} />)}
        </ol>
        {status.eligible && <Link href="/#booking-search" className="mt-3 inline-block text-sm font-bold text-[#C96100]">Book your reward ride →</Link>}
      </div>
    </div>
  </section>;
}

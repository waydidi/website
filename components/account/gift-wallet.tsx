import Link from "next/link";
import type { MemberGift } from "@/lib/gifts";
import { TIERS } from "@/lib/member-tier-rules";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Badge gifts: what the member has, when it expires, and how it's used.
export function GiftWallet({ gifts }: { gifts: MemberGift[] }) {
  if (!gifts.length) return null;
  return <section className="mb-4" aria-labelledby="gifts-heading">
    <h2 id="gifts-heading" className="mb-3 text-lg font-black">My gifts</h2>
    <ul className="grid gap-3">
      {gifts.map((g) => <li key={g.id} className={`flex items-center gap-4 rounded-[20px] bg-white p-5 ${g.status === "available" ? "" : "opacity-60"}`}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#FFF0DF] text-2xl" aria-hidden="true">{g.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{g.name}</p>
          <p className="mt-0.5 text-sm text-slate-600">{g.description}</p>
          <p className="mt-1 text-xs text-slate-500">{TIERS.find((t) => t.id === g.tier)?.name ?? "Badge"} gift · {g.status === "available" ? `Use by ${date(g.expiresAt)}. Applied automatically at checkout.` : g.status === "used" ? `Used on booking ${g.usedBookingReference}` : `Expired ${date(g.expiresAt)}`}</p>
        </div>
        {g.status === "available" && <Link href="/#booking-search" className="shrink-0 rounded-full bg-[#FF8A05] px-4 py-2 text-sm font-bold text-white">Use</Link>}
      </li>)}
    </ul>
  </section>;
}

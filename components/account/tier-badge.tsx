import Link from "next/link";
import { ChevronRight, Crown, Gem, Medal, Star } from "lucide-react";
import { TIERS, type memberTier, type Tier, type TierId } from "@/lib/member-tier-rules";
import { GIFTS, nearNextTier, TIER_GIFTS } from "@/lib/gift-rules";

const ICONS: Record<TierId, typeof Medal> = { bronze: Medal, gold: Star, diamond: Gem, platinum: Crown };
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** Small round badge, like Trip.com's tier medal. */
export function TierMedal({ tier, size = 44 }: { tier: Tier; size?: number }) {
  const Icon = ICONS[tier.id];
  return <span className="grid shrink-0 place-items-center rounded-full text-white shadow-[inset_0_-2px_0_rgba(0,0,0,.15)] ring-2 ring-white" style={{ background: tier.color, width: size, height: size }} aria-hidden="true"><Icon size={size * 0.48} strokeWidth={2.4} /></span>;
}

// Member card on the account pages: current badge, its discount, and progress to the next tier.
export function TierCard({ status, link = true }: { status: ReturnType<typeof memberTier>; link?: boolean }) {
  const { tier, next } = status;
  return <section className="overflow-hidden rounded-[20px] bg-white" aria-label={`${tier.name} member`}>
    <div className="flex items-center gap-4 p-5 text-white" style={{ background: tier.color }}>
      <TierMedal tier={tier} size={52} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-white/85">Waydidi member</p>
        <p className="text-[24px] font-black leading-tight drop-shadow-sm">{tier.name}</p>
      </div>
      <p className="rounded-full bg-white/95 px-3 py-1 text-[15px] font-black" style={{ color: tier.ink }}>{tier.percent}% off</p>
    </div>
    <div className="p-5">
      <p className="text-sm text-slate-700">{tier.perks[0]}, taken off automatically when you book signed in, on top of any promo code.</p>
      {next && nearNextTier(status) && TIER_GIFTS[next.id] && <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#FFF6EB] px-3 py-2.5 text-sm font-semibold text-[#8A4B00]"><span className="text-lg" aria-hidden="true">🎁</span>Almost there! Reach {next.name} to unlock: {GIFTS[TIER_GIFTS[next.id]!].name}</p>}
      {next ? <>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#FF8A05]" style={{ width: `${Math.round(status.progress * 100)}%` }} /></div>
        <p className="mt-2 text-sm text-slate-600"><strong>{status.ridesToNext}</strong> more completed ride{status.ridesToNext === 1 ? "" : "s"} or <strong>{thb(status.spendToNext)}</strong> more spend to reach <strong>{next.name}</strong> ({next.percent}% off).</p>
      </> : <p className="mt-2 text-sm font-semibold text-slate-700">You're at our highest tier. Thank you for riding with us.</p>}
      {link && <Link href="/account/membership" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#C96100]">See all tiers and benefits <ChevronRight size={16} /></Link>}
    </div>
  </section>;
}

// All tiers side by side, with how to reach each one.
export function TierTable({ current }: { current: TierId }) {
  return <ol className="grid gap-3 sm:grid-cols-2">
    {TIERS.map((t) => <li key={t.id} className={`rounded-[20px] bg-white p-5 ${t.id === current ? "ring-2 ring-[#FF8A05]" : ""}`}>
      <div className="flex items-center gap-3">
        <TierMedal tier={t} />
        <div className="min-w-0 flex-1"><p className="text-lg font-black">{t.name}</p><p className="text-xs text-slate-500">{t.rides === 0 ? "When you create an account" : `${t.rides} completed rides or ${thb(t.spend)} in 12 months`}</p></div>
        {t.id === current && <span className="rounded-full bg-[#FFF0DF] px-2.5 py-1 text-xs font-black text-[#C96100]">You</span>}
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm text-slate-700">{t.perks.map((p) => <li key={p}>✓ {p}</li>)}<li>✓ Every 5th ride 10% off (up to THB 500)</li>{TIER_GIFTS[t.id] && <li className="font-semibold text-[#C96100]">🎁 Badge gift: {GIFTS[TIER_GIFTS[t.id]!].name}</li>}</ul>
    </li>)}
  </ol>;
}

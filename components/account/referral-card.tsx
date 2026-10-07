"use client";

import { Check, Copy, Gift, Share2 } from "lucide-react";
import { useState } from "react";

/** "Invite friends": the member's code, ways to share it, and how their invites are doing. */
export function ReferralCard({ code, friendDiscount, reward, minFare, waiting, rewarded, earned }: { code: string; friendDiscount: number; reward: number; minFare: number; waiting: number; rewarded: number; earned: number }) {
  const [copied, setCopied] = useState(false);
  const message = `I use Waydidi for private rides in Thailand. Use my code ${code} for ฿${friendDiscount} off your first ride: https://waydidi.com`;
  const copy = () => void navigator.clipboard.writeText(code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); });
  const share = () => { if (navigator.share) void navigator.share({ title: "Waydidi", text: message }).catch(() => undefined); else void navigator.clipboard.writeText(message).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); };
  const btn = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold";
  return <section aria-labelledby="invite-friends" className="rounded-[22px] border border-[#F6B46E] bg-brand-wash p-5">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white"><Gift size={22} /></span>
      <div className="min-w-0">
        <h2 id="invite-friends" className="text-[18px] font-bold">Give ฿{friendDiscount}, get ฿{reward}</h2>
        <p className="mt-0.5 text-[14px] text-slate-700">Your friends get ฿{friendDiscount} off their first ride (from ฿{minFare}). When their ride is done, you get a ฿{reward} coupon.</p>
      </div>
    </div>
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-brand bg-white px-4 py-3">
      <span className="min-w-0 flex-1 font-mono text-[18px] font-bold tracking-wide text-brand-darker">{code}</span>
      <button type="button" onClick={copy} className={`${btn} bg-brand-tint text-brand-darker`}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy</>}</button>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      <button type="button" onClick={share} className={`${btn} bg-brand text-white hover:bg-brand-strong`}><Share2 size={15} />Share</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={`${btn} bg-[#25D366] text-white`}>WhatsApp</a>
      <a href={`https://line.me/R/share?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={`${btn} bg-line-green text-white`}>LINE</a>
    </div>
    <p className="mt-3 text-[13px] text-slate-600">{rewarded ? `${rewarded} ${rewarded === 1 ? "friend has" : "friends have"} ridden · ฿${earned} earned in coupons` : "No friends have ridden yet."}{waiting ? ` · ${waiting} upcoming` : ""}</p>
  </section>;
}

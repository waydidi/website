"use client";

import { useState } from "react";
import Link from "next/link";
import { TicketPercent } from "lucide-react";
import type { MemberCoupon } from "@/lib/promo-db";

const thb = (v: number) => `THB ${v.toLocaleString("en-US")}`;

function summary(c: MemberCoupon) {
  const off = c.discountType === "percent" ? `${c.discountValue}% off${c.maxDiscount ? ` up to ${thb(c.maxDiscount)}` : ""}` : `${thb(c.discountValue)} off`;
  const where = c.service === "hourly" ? "hourly driver" : c.service === "transfer" ? "transfers" : c.service === "return" ? "round-trip transfers" : "any ride";
  return `${off} · ${where}${c.minFare ? ` · min. ${thb(c.minFare)}` : ""}`;
}

export function CouponWallet({ coupons }: { coupons: MemberCoupon[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  function use(code: string) {
    try { sessionStorage.setItem("waydidi-promo", code); } catch { /* storage unavailable */ }
    navigator.clipboard?.writeText(code).catch(() => undefined);
    setCopied(code);
  }
  if (!coupons.length) return <div className="rounded-[20px] bg-white p-8 text-center text-slate-600"><TicketPercent className="mx-auto text-[#D96F00]" size={28} /><p className="mt-3 font-bold">No coupons right now</p><p className="mt-1 text-sm">New offers appear here as soon as they go live.</p></div>;
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">{coupons.map((c) => {
      const usable = c.status === "available";
      return <li key={c.code} className={`relative overflow-hidden rounded-[20px] bg-white p-5 ${usable ? "" : "opacity-60"}`}>
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[#FF8A05]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{c.title}</p>
            <p className="mt-1 text-sm text-slate-600">{summary(c)}</p>
            {c.endsAt && <p className="mt-1 text-xs text-slate-500">Valid until {new Date(c.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${usable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{c.note}</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-11 min-w-0 flex-1 items-center rounded-xl bg-[#F4F4F2] px-3 font-mono text-[15px] tracking-wide">{c.code}</span>
          {usable && <Link href="/" onClick={() => use(c.code)} className="flex h-11 shrink-0 items-center rounded-xl bg-[#FF8A05] px-4 text-sm font-bold text-white">{copied === c.code ? "Copied!" : "Use now"}</Link>}
        </div>
        {c.offerTerms.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">{c.offerTerms.map((t) => <li key={t}>{t}</li>)}</ul>}
      </li>;
    })}</ul>
    <p className="text-sm text-slate-500">At checkout, the best coupon for your ride is applied automatically.</p>
  </div>;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Promotions for first-time customers (tiket.com style). EXAMPLES ONLY:
// checkout does not apply promo codes yet. Replace with real offers, and
// set PROMOTIONS_READY once checkout honours the codes.
export const PROMOTIONS_READY = false;
const PROMOTIONS = [
  { title: "[New Users] 10% off your first private transfer", code: "WAYDIDINEW", terms: "/terms" },
  { title: "THB 200 off Bangkok ⇄ Pattaya transfers", code: "PATTAYA200", terms: "/terms" },
  { title: "15% off an hourly private driver, 5 hours or more", code: "HOURLY15", terms: "/terms" },
];

function PromoCard({ title, code, terms }: (typeof PROMOTIONS)[number]) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); } catch { /* still show the code */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <li className="relative w-[86%] max-w-[360px] shrink-0 snap-start rounded-2xl bg-white px-5 py-5 shadow-[0_2px_10px_rgba(90,40,0,.06)]">
    {/* ticket notches, cut in the section's background colour */}
    <span aria-hidden="true" className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-[#FFF3E6]" />
    <span aria-hidden="true" className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-[#FFF3E6]" />
    <p className="min-h-12 text-[16px] font-medium leading-6 text-[#1C1C1C]">
      {title} <Link href={terms} className="font-semibold text-[#E07400]">T&amp;C</Link>
    </p>
    <div className="mt-4 flex items-center gap-3">
      <span className="flex h-11 min-w-0 flex-1 items-center truncate rounded-lg bg-[#F4F4F2] px-3 text-[15px] text-[#1C1C1C]">{code}</span>
      <button type="button" onClick={copy} className="h-11 shrink-0 rounded-lg bg-brand px-4 text-[15px] font-semibold text-white transition hover:bg-brand-hover" aria-live="polite">
        {copied ? "Copied!" : "Copy & Use"}
      </button>
    </div>
  </li>;
}

export function Promotions() {
  // Until real codes work at checkout, show only when previewing: /?promos=preview
  const [preview, setPreview] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL after hydration
  useEffect(() => setPreview(new URLSearchParams(window.location.search).get("promos") === "preview"), []);
  if (!PROMOTIONS_READY && !preview) return null;
  return <section className="bg-gradient-to-b from-[#FFF3E6] to-[#FFF9F3] py-8" aria-labelledby="promotions-heading">
    <h2 id="promotions-heading" className="mx-auto max-w-[1180px] px-5 text-[19px] font-semibold tracking-[-.01em] sm:text-[22px] text-[#1C1C1C] lg:px-0">Special promotion for your first transaction</h2>
    {/* Native horizontal scroll with snap: smooth with a finger or trackpad. */}
    <ul className="mx-auto mt-4 flex max-w-[1180px] snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto overscroll-x-contain px-5 pb-3 [scrollbar-width:none] lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      {PROMOTIONS.map((promo) => <PromoCard key={promo.code} {...promo} />)}
    </ul>
  </section>;
}

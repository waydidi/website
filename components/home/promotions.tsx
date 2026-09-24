"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

// Promotions (tiket.com style). Real offers come from Admin → Promotions
// (/api/promotions); the examples below only show with /?promos=preview.
type Promotion = {
  title: string;
  code: string;
  period: string;
  travel: string;
  service: string;
  offer: string[];
};
const EXAMPLES: Promotion[] = [
  { title: "[New Users] 20% off your first Waydidi ride", code: "NEWUSER20", period: "Anytime", travel: "Anytime", service: "Private transfers and hourly private driver",
    offer: ["Discount 20% on your first Waydidi booking.", "Valid for your first Waydidi booking only (per email, phone and account)."] },
];

type PublicPromotion = {
  code: string; title: string; startsAt: string | null; endsAt: string | null; service: string; minFare: number;
  discountType: string; discountValue: number; maxDiscount: number | null; firstBookingOnly: boolean; perCustomerLimit: number; offerTerms: string[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

// Builds the T&C text from the code's real rules.
function toPromotion(p: PublicPromotion): Promotion {
  const amount = p.discountType === "percent" ? `${p.discountValue}%${p.maxDiscount ? ` up to THB ${p.maxDiscount.toLocaleString("en-US")}` : ""}` : `THB ${p.discountValue.toLocaleString("en-US")}`;
  const rules = [
    `Discount ${amount}${p.minFare ? ` with a minimum fare of THB ${p.minFare.toLocaleString("en-US")}` : ""}.`,
    ...(p.firstBookingOnly ? ["Valid for your first Waydidi booking only (per email, phone and account)."] : []),
  ];
  return {
    title: p.title,
    code: p.code,
    period: p.startsAt || p.endsAt ? `${p.startsAt ? day(p.startsAt) : "Now"} – ${p.endsAt ? day(p.endsAt) : "until further notice"}` : "Until further notice",
    travel: "Anytime",
    service: p.service === "hourly" ? "Hourly private driver" : p.service === "return" ? "Private transfers booked with a return journey" : p.service === "transfer" ? "Private transfers" : "Private transfers and hourly private driver",
    offer: [...rules, ...p.offerTerms.filter((line) => !rules.includes(line))],
  };
}

function PromoCard({ promo, onTerms }: { promo: Promotion; onTerms: () => void }) {
  const { title, code } = promo;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); } catch { /* still show the code */ }
    // "Use": the Payment step picks this up and fills in the promo box.
    try { sessionStorage.setItem("waydidi-promo", code); } catch { /* storage unavailable */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <li className="relative w-[86%] max-w-[360px] shrink-0 snap-start rounded-2xl bg-white px-5 py-5 shadow-[0_2px_10px_rgba(90,40,0,.06)]">
    {/* ticket notches, cut in the section's background colour */}
    <span aria-hidden="true" className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-[#FFF3E6]" />
    <span aria-hidden="true" className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-[#FFF3E6]" />
    <button type="button" onClick={onTerms} className="absolute right-4 top-3 text-[13px] font-semibold text-[#E07400] underline-offset-2 hover:underline">T&amp;C</button>
    <p className="min-h-12 pr-8 text-[16px] font-medium leading-6 text-[#1C1C1C]">{title}</p>
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
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [terms, setTerms] = useState<Promotion | null>(null);
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("promos") === "preview";
    let alive = true;
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : { promotions: [] }))
      .then((body: { promotions?: PublicPromotion[] }) => {
        if (!alive) return;
        const live = (body.promotions ?? []).map(toPromotion);
        setPromotions(live.length ? live : preview ? EXAMPLES : []);
      })
      .catch(() => { if (alive && preview) setPromotions(EXAMPLES); });
    return () => { alive = false; };
  }, []);
  if (!promotions.length) return null;
  return <section className="bg-gradient-to-b from-[#FFF3E6] to-[#FFF9F3] py-8" aria-labelledby="promotions-heading">
    <h2 id="promotions-heading" className="mx-auto max-w-[1180px] px-5 text-[19px] font-semibold tracking-[-.01em] sm:text-[22px] text-[#1C1C1C] lg:px-0">Special promotion for your first transaction</h2>
    {/* Native horizontal scroll with snap: smooth with a finger or trackpad. */}
    <ul className="mx-auto mt-4 flex max-w-[1180px] snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto overscroll-x-contain px-5 pb-3 [scrollbar-width:none] lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      {promotions.map((promo) => <PromoCard key={promo.code} promo={promo} onTerms={() => setTerms(promo)} />)}
    </ul>
    <TermsSheet promo={terms} onClose={() => setTerms(null)} />
  </section>;
}

// Promo terms, bottom sheet (tiket.com style), with Waydidi's own policies.
function TermsSheet({ promo, onClose }: { promo: Promotion | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!promo) return;
    try { await navigator.clipboard.writeText(promo.code); } catch { /* code is visible anyway */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  function bookNow() {
    onClose();
    window.setTimeout(() => document.getElementById("booking-search")?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
  }
  const general = promo ? [
    `Promo period: ${promo.period}`,
    `Travel period: ${promo.travel}`,
    "Promo is valid for bookings made on the Waydidi website",
    "Promo is valid for card (Stripe) and cash payments",
    "Promo code is valid once per customer (email, phone number or Waydidi account)",
    "Quota: Limited",
    "Cannot be combined with other promo codes",
  ] : [];
  return <DialogPrimitive.Root open={Boolean(promo)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content className="font-home fixed inset-x-0 bottom-0 z-[81] flex max-h-[90dvh] flex-col rounded-t-[22px] bg-white text-[#1C1C1C] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2">
        {promo && <>
          <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-[#D9D9D9]" aria-hidden="true" />
          <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
            <DialogPrimitive.Title className="text-[21px] font-semibold leading-snug">Your promo code is ready to use at payment.</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-5 text-[15px] text-[#6B6B6B]">Terms and Conditions:</DialogPrimitive.Description>
            <h3 className="mt-3 text-[16px] font-semibold underline underline-offset-4">General Terms &amp; Conditions</h3>
            <ol className="mt-3 grid list-decimal gap-1.5 pl-6 text-[15px] leading-6 text-[#2B2B2B]">{general.map((line) => <li key={line}>{line}</li>)}</ol>
            <h3 className="mt-6 text-[16px] font-semibold underline underline-offset-4">Product Terms &amp; Conditions</h3>
            <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold"><span className="size-1.5 rounded-full bg-[#1C1C1C]" aria-hidden="true" />{promo.service}</p>
            <ol className="mt-2 grid list-decimal gap-1.5 pl-6 text-[15px] leading-6 text-[#2B2B2B]">{promo.offer.map((line) => <li key={line}>{line}</li>)}</ol>
            <h3 className="mt-6 text-[16px] font-semibold underline underline-offset-4">Booking policies</h3>
            <ol className="mt-3 grid list-decimal gap-1.5 pl-6 text-[15px] leading-6 text-[#2B2B2B]">
              <li>Free cancellation up to 24 hours before pickup, by email to support@waydidi.com with your booking reference.</li>
              <li>Refunds go back to the original payment method and cover the amount actually paid after the discount.</li>
              <li>The discount applies to the fare shown at booking; extra stops, waiting or route changes are charged separately.</li>
              <li>Waydidi may cancel a discount that is used against these terms.</li>
            </ol>
            <p className="mt-4 text-[14px] text-[#6B6B6B]">Full terms: <Link href="/terms" className="font-medium text-[#E07400] underline underline-offset-2">Booking terms</Link> · <Link href="/cancellation-refund-policy" className="font-medium text-[#E07400] underline underline-offset-2">Cancellation &amp; refunds</Link></p>
          </div>
          <div className="grid gap-3 border-t border-[#F0F0F0] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#D9D9D9] py-2 pl-5 pr-2">
              <span className="min-w-0 flex-1 truncate text-[16px] tracking-wide">{promo.code}</span>
              <button type="button" onClick={copy} className="h-11 rounded-lg bg-[#FFF1E0] px-6 text-[15px] font-semibold text-[#E07400]" aria-live="polite">{copied ? "Copied!" : "Copy"}</button>
            </div>
            <button type="button" onClick={bookNow} className="h-[52px] rounded-xl bg-brand text-[17px] font-semibold text-white hover:bg-brand-hover">Book now</button>
          </div>
        </>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

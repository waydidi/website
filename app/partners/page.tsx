import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { PartnerApplyForm } from "@/components/partner/apply-form";
import { PublicFooter } from "@/components/public-footer";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo";
import { DEFAULT_COMMISSION, DEFAULT_DISCOUNT } from "@/lib/affiliates";
import { SITE_URL } from "@/lib/public-content";

const URL_PATH = "/partners";
export const metadata: Metadata = {
  title: `Waydidi Partners – Earn ${DEFAULT_COMMISSION}% on every ride you send us`,
  description: "Join the Waydidi partner program: travel bloggers, hotels, guides and local businesses earn commission on private transfers in Thailand. Free to join.",
  alternates: { canonical: `${SITE_URL}${URL_PATH}` },
};

const STEPS = [
  ["Apply", "Tell us about you. We reply within 1 business day."],
  ["Get your link and code", "Your own link (waydidi.com/?ref=you), a code for your followers and a private dashboard."],
  ["Share", "Blog posts, videos, your hotel front desk, LINE or WhatsApp groups."],
  ["Earn", `You earn ${DEFAULT_COMMISSION}% of every completed ride. Your customers get ${DEFAULT_DISCOUNT}% off with your code.`],
];
const WHO = [["Travel bloggers & creators", "Posts and videos about getting around Thailand."], ["Hotels, villas & hostels", "Guests ask every day how to get to the airport or the next island."], ["Guides & tour companies", "Your customers need transfers before and after the tour."], ["Local businesses", "Dive shops, restaurants, travel desks on Koh Chang, Phuket, Krabi…"]];
const FAQ = [
  { q: "How much does it cost to join?", a: "Nothing. The program is free." },
  { q: "When do I earn?", a: `When a ride booked with your link or code is completed. You earn ${DEFAULT_COMMISSION}% of what the customer paid. Cancelled rides don't earn commission.` },
  { q: "How long does my link count?", a: "30 days. If someone clicks your link and books within 30 days, the booking is yours (unless they click another partner's link later)." },
  { q: "How and when am I paid?", a: "Monthly, by Thai bank transfer or PromptPay, for rides completed in the previous month." },
  { q: "Can I book for myself with my code?", a: "No. Bookings by the partner themself don't earn commission." },
  { q: "Where can I see my results?", a: "In your private partner dashboard: clicks, bookings, what you've earned and what's pending." },
];

export default function PartnersPage() {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Partners", path: URL_PATH }];
  return <main className="font-home bg-white text-plum">
    <JsonLd data={[breadcrumbSchema(crumbs), faqSchema(FAQ)]} />
    <section className="bg-[linear-gradient(180deg,#FE8B05,#FFA94D)] text-white">
      <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <p className="text-[15px] font-semibold opacity-95">Waydidi Partners</p>
        <h1 className="mt-2 max-w-2xl text-[34px] font-bold leading-[1.1] sm:text-[48px]">Earn {DEFAULT_COMMISSION}% on every ride you send us</h1>
        <p className="mt-4 max-w-xl text-[17px] leading-7 opacity-95">For travel bloggers, hotels, guides and local businesses in Thailand. Free to join, paid monthly, and your customers save {DEFAULT_DISCOUNT}%.</p>
        <a href="#apply" className="mt-7 inline-flex h-12 items-center rounded-full bg-white px-7 font-semibold text-brand-darker hover:bg-brand-wash">Apply to join</a>
      </div>
    </section>

    <div className="mx-auto max-w-[1080px] px-4 sm:px-6 lg:px-8">
      <section className="py-12">
        <h2 className="text-[28px] font-bold">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{STEPS.map(([t, d], i) => <li key={t} className="rounded-2xl border border-slate-200 p-5">
          <span className="grid size-9 place-items-center rounded-full bg-brand font-bold text-white">{i + 1}</span>
          <p className="mt-3 text-[17px] font-semibold">{t}</p><p className="mt-1 text-[15px] leading-6 text-slate-600">{d}</p>
        </li>)}</ol>
      </section>

      <section className="pb-12">
        <h2 className="text-[28px] font-bold">Who it&apos;s for</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">{WHO.map(([t, d]) => <li key={t} className="rounded-2xl bg-brand-wash p-5"><p className="text-[17px] font-semibold">{t}</p><p className="mt-1 text-[15px] text-slate-700">{d}</p></li>)}</ul>
      </section>

      <section id="apply" className="scroll-mt-24 pb-12">
        <h2 className="text-[28px] font-bold">Apply to join</h2>
        <p className="mb-5 mt-2 text-[15px] text-slate-600">It takes 2 minutes. We&apos;ll email you once you&apos;re approved.</p>
        <PartnerApplyForm />
      </section>

      <section className="pb-14">
        <h2 className="text-[28px] font-bold">Questions</h2>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{FAQ.map((f) => <details key={f.q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">{f.q}<ChevronDown size={20} className="shrink-0 transition group-open:rotate-180" /></summary>
          <p className="mt-3 leading-7 text-slate-700">{f.a}</p>
        </details>)}</div>
        <p className="mt-6 text-[13px] leading-6 text-slate-500"><b>Partner terms (short):</b> commission is paid on completed rides only, on what the customer paid; cancelled or refunded rides earn nothing. No bookings for yourself, no fake or misleading promotion, and no paid search ads that use the Waydidi name. Waydidi may pause a partner account that breaks these rules. Rates may change with 30 days&apos; notice.</p>
      </section>
    </div>
    <PublicFooter />
  </main>;
}

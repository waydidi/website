import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, FileText, Headphones, MapPinned, Network, Percent } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { AgencyForm } from "@/components/agencies/agency-form";
import { SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Travel agencies: partner with Waydidi | Private transfers in Thailand",
  description: "Book private airport transfers and drivers across Thailand for your clients. Agency rates, fixed prices, Meet & Greet and one place to manage every booking.",
  alternates: { canonical: `${SITE_URL}/agencies` },
};

// Facts about the service itself (no made-up partner counts or ratings).
const FACTS = [
  { value: "Fixed", label: "Price agreed before booking" },
  { value: "24h", label: "Free cancellation window" },
  { value: "60 min", label: "Free waiting at airports" },
  { value: "Meet & Greet", label: "Name sign at arrivals" },
];

const CARDS = [
  { icon: Network, title: "Integration & API", soon: true, text: "Connect Waydidi to your booking tools, or keep working from one simple dashboard. We're building this with our first partners." },
  { icon: MapPinned, title: "Thailand, end to end", text: "Airports, cities, beaches and islands: Bangkok, Pattaya, Hua Hin, Phuket, Krabi, Koh Chang and the routes in between." },
  { icon: Percent, title: "Agency rates & clear pricing", text: "Partner rates agreed with you up front, and one fixed price per ride with tolls stated clearly. No surprises for your clients." },
  { icon: Headphones, title: "A real team behind every ride", text: "A local operations team handles flight delays, changes and questions, so your clients are looked after from landing to drop-off." },
];

const STEPS = [
  { title: "Apply online in minutes", text: "Tell us about your agency and the routes your clients travel." },
  { title: "Agree your rates", text: "We confirm your partner rates, payment method and how you'd like confirmations sent." },
  { title: "Book and relax", text: "Book rides in a few taps. Your clients get a clear confirmation, Meet & Greet at arrivals and support if plans change." },
];

export default function AgenciesPage() {
  return <main className="font-home bg-[#F5F4F0] text-[#111]">
    {/* Hero */}
    <section className="relative isolate overflow-hidden bg-[#111] text-white">
      <Image src="/hero-driver-customer.webp" alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover object-[65%_center] opacity-45" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/40 to-black/80" />
      <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-24 sm:pt-32 lg:px-0">
        <h1 className="text-[40px] font-bold leading-[1.1] tracking-[-.03em] sm:text-[56px]">Travel Agencies</h1>
        <p className="mt-5 max-w-[640px] text-[18px] leading-8 text-white/85">Partner with Waydidi and offer your clients private transfers across Thailand. Apply today for agency rates and a team that looks after every ride.</p>
        <a href="#apply" className="mt-8 inline-flex h-14 items-center rounded-2xl bg-white px-10 text-[18px] font-bold text-[#111] hover:bg-white/90">Join Now!</a>
        <dl className="mt-10 grid max-w-[560px] grid-cols-2 gap-y-8">
          {FACTS.map((f, i) => <div key={f.label} className={i % 2 ? "border-l border-white/25 pl-7" : "pr-4"}>
            <dt className="sr-only">{f.label}</dt>
            <dd className="text-[34px] font-bold leading-none tracking-[-.02em]">{f.value}</dd>
            <dd className="mt-2 text-[15px] text-white/70">{f.label}</dd>
          </div>)}
        </dl>
      </div>
    </section>

    <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
      <nav aria-label="Breadcrumb" className="pt-8"><ol className="flex items-center gap-2 text-[16px] text-[#444]">
        <li><Link href="/" className="hover:text-[#111]">Home</Link></li>
        <li aria-hidden="true"><ChevronRight size={16} className="fill-current" /></li>
        <li>Travel Agencies</li>
      </ol></nav>
      <p className="mt-10 text-[20px] font-bold leading-snug text-[#555]">Create your agency account and start booking with us!</p>

      {/* Why partner */}
      <section className="pt-14" aria-labelledby="why-heading">
        <h2 id="why-heading" className="text-[40px] font-bold leading-[1.08] tracking-[-.03em] sm:text-[52px]">Why Partner with Waydidi?</h2>
        <p className="mt-8 max-w-[760px] text-[20px] leading-9 text-[#555]"><strong className="font-bold text-[#111]">Easy booking & management</strong> Book, change and track your clients&apos; rides in one place, with every detail confirmed in writing.</p>
        <p className="mt-10 max-w-[760px] text-[18px] leading-8 text-[#555]">As a partner, you book private transfers for your clients on Waydidi with vehicles from sedans to minivans, fixed prices, and drivers who meet your clients at arrivals with a name sign.</p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {CARDS.map(({ icon: Icon, title, text, soon }) => <li key={title} className="rounded-[28px] border border-[#E4E1DA] bg-gradient-to-br from-white via-white to-[#F7F6F2] p-7 sm:p-8">
            <span className="grid size-16 place-items-center rounded-2xl bg-[#EFEEEA]"><Icon size={26} strokeWidth={2.4} aria-hidden="true" /></span>
            <p className="mt-9 flex items-baseline justify-between gap-3"><span className="text-[22px] font-bold tracking-[-.01em]">{title}</span>{soon && <span className="shrink-0 text-[15px] font-semibold text-[#777]">Coming Soon</span>}</p>
            <p className="mt-4 text-[16px] leading-7 text-[#555]">{text}</p>
          </li>)}
        </ul>
        <a href="#apply" className="mt-12 inline-flex h-14 items-center rounded-full bg-[#FF8A05] px-10 text-[18px] font-bold text-[#111] hover:bg-[#F07A00]">Join Now!</a>
        <p className="mt-6 text-[17px] leading-7 text-[#555]">Ready to make Thailand transfers simple? Join the agencies booking their clients&apos; rides with Waydidi.</p>
      </section>

      {/* Tools */}
      <section className="mt-14 rounded-[28px] border border-[#E4E1DA] bg-gradient-to-br from-white via-white to-[#F7F6F2] p-7 sm:p-10" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="max-w-[420px] text-[28px] font-bold leading-tight tracking-[-.02em]">Tools built for travel professionals</h2>
        <ul className="mt-8 grid gap-5 text-[17px] leading-7 text-[#555]">
          <li className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />Partner rates, booking confirmations and PDF vouchers for every ride.</li>
          <li className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />Tax invoices on request, with your company details saved for next time.</li>
          <li className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />API and white-label booking for your own website (coming soon).</li>
        </ul>
      </section>

      {/* How it works */}
      <section className="mt-14 rounded-[28px] bg-black px-7 py-10 text-white sm:px-12 sm:py-14" aria-labelledby="steps-heading">
        <p className="text-[16px] font-semibold text-white/60">How it works</p>
        <h2 id="steps-heading" className="mt-6 max-w-[640px] text-[28px] font-medium leading-[1.35] tracking-[-.01em] sm:text-[32px]">From application to your first booking, usually within a few working days.</h2>
        <ol className="mt-12 grid gap-9">
          {STEPS.map((s, i) => <li key={s.title} className="flex gap-6">
            <span className="grid size-[62px] shrink-0 place-items-center rounded-full border-2 border-white/60 text-[20px] font-bold">{i + 1}</span>
            <div><p className="text-[21px] font-bold">{s.title}</p><p className="mt-1 text-[16px] leading-6 text-white/70">{s.text}</p></div>
          </li>)}
        </ol>
      </section>

      {/* Apply */}
      <section id="apply" className="scroll-mt-24 pb-20 pt-20" aria-labelledby="apply-heading">
        <h2 id="apply-heading" className="text-[40px] font-bold leading-[1.08] tracking-[-.03em] sm:text-[52px]">Apply to partner</h2>
        <p className="mb-8 mt-4 max-w-[640px] text-[18px] leading-8 text-[#555]">Tell us about your agency. Our partnerships team replies within 2 working days.</p>
        <AgencyForm />
        <p className="mt-6 flex items-center gap-2 text-[15px] text-[#555]"><FileText size={17} aria-hidden="true" />Questions first? <Link href="/contact" className="font-semibold text-[#111] underline">Contact us</Link></p>
      </section>
    </div>
    <PublicFooter />
  </main>;
}

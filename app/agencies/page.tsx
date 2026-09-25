import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Luggage, Users, FileText, Gauge, Headphones, ListChecks, Mail, MapPinned, Network, Percent, ReceiptText } from "lucide-react";
import { BookingsMockup, DashboardMockup, DetailMockup } from "@/components/agencies/workspace-mockup";
import { PublicFooter } from "@/components/public-footer";
import { AgencyForm } from "@/components/agencies/agency-form";
import { NewsletterForm } from "@/components/agencies/newsletter-form";
import { VEHICLES } from "@/lib/vehicles";
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

// The agency workspace is planned, not live yet: the page says so, and the mockups use example data.
const WORKSPACE = [
  { icon: Gauge, label: "Dashboard", Mock: DashboardMockup, title: "Your agency at a glance", text: "The home view will greet you with your agency name, your partner rate and the numbers that matter: passengers served, upcoming rides and total bookings, with quick actions one tap away.", points: ["Upcoming, completed and passenger totals.", "Quick actions to book, manage passengers and download statements.", "A direct line to your Waydidi partnerships contact."] },
  { icon: ListChecks, label: "Bookings", Mock: BookingsMockup, title: "Every transfer, organised and searchable", text: "Filter upcoming, completed and cancelled rides, search by pickup, destination or passenger, and see each booking's payment status with clear colour-coded labels.", points: ["Upcoming, completed and cancelled tabs.", "Search by reference, passenger, address or date range.", "Status badges: Confirmed, Awaiting payment and more."] },
  { icon: ReceiptText, label: "Booking detail", Mock: DetailMockup, title: "Full control of every ride", text: "Open any booking to review the route, vehicle, passenger details and total price. Pay securely, share the voucher with your traveller or contact support, all from one screen.", points: ["Route, vehicle and passenger info in a single view.", "Pay securely and download the voucher in one click.", "Reach our partner support whenever you need a hand."] },
];

const FLEET = [
  { id: "economy_sedan", title: "Economy", models: "Comfortable 4-door sedan", image: "/vehicle-economy-sedan.webp" },
  { id: "comfort_bmw", title: "Comfort BMW", models: "BMW sedan or similar", image: "/vehicle-comfort-bmw.webp" },
  { id: "comfort_suv", title: "Comfort SUV", models: "Spacious SUV for families and luggage", image: "/vehicle-comfort-suv.webp" },
  { id: "premium_minivan", title: "Premium Minivan", models: "Van for groups of up to 9", image: "/vehicle-premium-minivan.webp" },
] as const;

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
        <h1 className="text-[30px] font-bold leading-[1.15] tracking-[-.02em] sm:text-[48px]">Travel Agencies</h1>
        <p className="mt-5 max-w-[640px] text-[15px] leading-[22px] text-white/85 sm:text-[18px] sm:leading-8">Partner with Waydidi and offer your clients private transfers across Thailand. Apply today for agency rates and a team that looks after every ride.</p>
        <a href="#apply" className="mt-8 inline-flex h-12 items-center rounded-2xl bg-white px-10 text-[15px] font-bold text-[#111] hover:bg-white/90">Join Now!</a>
        <dl className="mt-10 grid max-w-[560px] grid-cols-2 gap-y-8">
          {FACTS.map((f, i) => <div key={f.label} className={i % 2 ? "border-l border-white/25 pl-7" : "pr-4"}>
            <dt className="sr-only">{f.label}</dt>
            <dd className="text-[24px] font-bold leading-none tracking-[-.02em] sm:text-[32px]">{f.value}</dd>
            <dd className="mt-2 text-[12px] text-white/70 sm:text-[14px]">{f.label}</dd>
          </div>)}
        </dl>
      </div>
    </section>

    <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
      <nav aria-label="Breadcrumb" className="pt-8"><ol className="flex items-center gap-2 text-[13px] text-[#444] sm:text-[15px]">
        <li><Link href="/" className="hover:text-[#111]">Home</Link></li>
        <li aria-hidden="true"><ChevronRight size={16} className="fill-current" /></li>
        <li>Travel Agencies</li>
      </ol></nav>
      <p className="mt-10 text-[14px] font-bold leading-[19px] text-[#555] sm:text-[18px] sm:leading-snug">Create your agency account and start booking with us!</p>

      {/* Why partner */}
      <section className="pt-14" aria-labelledby="why-heading">
        <h2 id="why-heading" className="text-[34px] font-bold leading-[1.15] tracking-[-.02em] sm:text-[52px]">Why Partner with Waydidi?</h2>
        <p className="mt-8 max-w-[760px] text-[16px] leading-[27px] text-[#555] sm:text-[19px] sm:leading-8"><strong className="font-bold text-[#111]">Easy booking & management</strong> Book, change and track your clients&apos; rides in one place, with every detail confirmed in writing.</p>
        <p className="mt-10 max-w-[760px] text-[14px] leading-[23px] text-[#555] sm:text-[17px] sm:leading-7">As a partner, you book private transfers for your clients on Waydidi with vehicles from sedans to minivans, fixed prices, and drivers who meet your clients at arrivals with a name sign.</p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {CARDS.map(({ icon: Icon, title, text, soon }) => <li key={title} className="rounded-[28px] border border-[#E4E1DA] bg-gradient-to-br from-white via-white to-[#F7F6F2] p-7 sm:p-8">
            <span className="grid size-16 place-items-center rounded-2xl bg-[#EFEEEA]"><Icon size={26} strokeWidth={2.4} aria-hidden="true" /></span>
            <p className="mt-9 flex items-baseline justify-between gap-3"><span className="text-[17px] font-bold tracking-[-.01em] sm:text-[21px]">{title}</span>{soon && <span className="shrink-0 text-[12px] font-semibold text-[#777] sm:text-[14px]">Coming Soon</span>}</p>
            <p className="mt-4 text-[13px] leading-5 text-[#555] sm:text-[15px] sm:leading-6">{text}</p>
          </li>)}
        </ul>
        <a href="#apply" className="mt-12 inline-flex h-12 items-center rounded-full bg-[#FF8A05] px-9 text-[15px] font-bold text-[#111] hover:bg-[#F07A00]">Join Now!</a>
        <p className="mt-6 text-[14px] leading-[21px] text-[#555] sm:text-[16px] sm:leading-7">Ready to make Thailand transfers simple? Join the agencies booking their clients&apos; rides with Waydidi.</p>
      </section>

      {/* Tools */}
      <section className="mt-14 rounded-[28px] border border-[#E4E1DA] bg-gradient-to-br from-white via-white to-[#F7F6F2] p-7 sm:p-10" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="max-w-[420px] text-[20px] font-bold leading-tight tracking-[-.02em] sm:text-[26px]">Tools built for travel professionals</h2>
        <ul className="mt-8 grid gap-5 text-[14px] leading-[21px] text-[#555] sm:text-[16px] sm:leading-7">
          <li className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />Partner rates, booking confirmations and PDF vouchers for every ride.</li>
          <li className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />Tax invoices on request, with your company details saved for next time.</li>
          <li className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />API and white-label booking for your own website (coming soon).</li>
        </ul>
      </section>

      {/* How it works */}
      <section className="mt-14 rounded-[28px] bg-black px-7 py-10 text-white sm:px-12 sm:py-14" aria-labelledby="steps-heading">
        <p className="text-[12px] font-semibold text-white/60 sm:text-[14px]">How it works</p>
        <h2 id="steps-heading" className="mt-6 max-w-[640px] text-[18px] font-medium leading-[31px] sm:text-[26px] sm:leading-[1.5]">From application to your first booking, usually within a few working days.</h2>
        <ol className="mt-12 grid gap-9">
          {STEPS.map((s, i) => <li key={s.title} className="flex gap-6">
            <span className="grid size-[62px] shrink-0 place-items-center rounded-full border-2 border-white/60 text-[16px] font-bold">{i + 1}</span>
            <div><p className="text-[16px] font-bold sm:text-[19px]">{s.title}</p><p className="mt-1 text-[13px] leading-[18px] text-white/70 sm:text-[15px] sm:leading-6">{s.text}</p></div>
          </li>)}
        </ol>
      </section>

      {/* Agency workspace (preview) */}
      <section className="pt-24 text-center" aria-labelledby="workspace-heading">
        <p className="text-[13px] font-semibold text-[#666] sm:text-[15px]">Agency workspace <span className="ml-1 rounded-full bg-[#FFE7C7] px-2.5 py-0.5 text-[11px] font-bold text-[#8A4B00]">Coming soon</span></p>
        <h2 id="workspace-heading" className="mx-auto mt-5 max-w-[760px] text-[34px] font-bold leading-[1.15] tracking-[-.02em] sm:text-[52px]">A dedicated dashboard for your agency</h2>
        <p className="mx-auto mt-6 max-w-[720px] text-[16px] leading-[27px] text-[#555] sm:text-[18px] sm:leading-8">A preview of the Waydidi agency account we&apos;re building with our first partners: one clean workspace to run every booking, passenger and invoice. Until it launches, our team books and manages rides for you.</p>
        <div className="mx-auto mt-12 max-w-[900px]"><DashboardMockup /></div>
        <p className="mt-3 text-[13px] text-[#999]">Design preview with example data.</p>
      </section>

      {WORKSPACE.map(({ icon: Icon, label, Mock, title, text, points }, i) => <section key={label} className="pt-20" aria-labelledby={`ws-${i}`}>
        {i > 0 && <div className="mx-auto mb-14 max-w-[900px]"><Mock /></div>}
        <p className="flex items-center gap-3 text-[14px] font-semibold text-[#666] sm:text-[16px]"><Icon size={24} className="text-[#111]" aria-hidden="true" />{label}</p>
        <h3 id={`ws-${i}`} className="mt-6 max-w-[760px] text-[28px] font-bold leading-[1.2] tracking-[-.02em] sm:text-[44px]">{title}</h3>
        <p className="mt-7 max-w-[760px] text-[16px] leading-[27px] text-[#555] sm:text-[18px] sm:leading-8">{text}</p>
        <ul className="mt-8 grid gap-5 text-[14px] leading-[21px] text-[#555] sm:text-[16px] sm:leading-7">{points.map((pt) => <li key={pt} className="flex gap-4"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-[#999]" aria-hidden="true" />{pt}</li>)}</ul>
      </section>)}

      <section className="py-24 text-center" aria-labelledby="safe-heading">
        <h2 id="safe-heading" className="text-[18px] font-bold sm:text-[20px] tracking-[-.02em] sm:text-[32px]">Your customers in safe hands</h2>
        <p className="mx-auto mt-4 max-w-[560px] text-[14px] leading-[23px] text-[#555] sm:text-[17px] sm:leading-7">Look after your clients&apos; rides in Thailand with a partner built for travel agencies.</p>
        <a href="#apply" className="mt-9 inline-flex h-12 items-center rounded-full bg-[#FF8A05] px-9 text-[15px] font-bold text-[#111] hover:bg-[#F07A00]">Join Now!</a>
      </section>
    </div>

    {/* Let's connect */}
    <section className="bg-black text-white" aria-labelledby="connect-heading">
      <div className="mx-auto max-w-[1180px] px-5 py-20 lg:px-0">
        <p className="text-[13px] font-semibold text-white/60 sm:text-[15px]">Agency support</p>
        <h2 id="connect-heading" className="mt-6 text-[32px] font-bold tracking-[-.02em] sm:text-[52px]">Let&apos;s Connect</h2>
        <p className="mt-6 max-w-[720px] text-[16px] leading-[25px] text-white/85 sm:text-[18px] sm:leading-8">Our partnerships team is here to help you every step of the way.</p>
        <p className="mt-5 max-w-[720px] text-[14px] leading-[20px] text-white/70 sm:text-[16px] sm:leading-7">Prefer to talk first? Send your details in the form below and ask for a call. We&apos;ll get back to you within 2 working days.</p>
        <div className="mt-10 max-w-[560px] rounded-[28px] border border-white/15 bg-[#0D0D0D] p-8">
          <div className="flex items-center gap-5"><span className="grid size-16 place-items-center rounded-full bg-white/10"><Mail size={26} aria-hidden="true" /></span><div><p className="text-[18px] font-bold sm:text-[20px]">Waydidi partnerships</p><p className="text-[13px] text-white/60">Travel agency support</p></div></div>
          <p className="mt-7 text-[12px] text-white/60">Email</p>
          <a href="mailto:support@waydidi.com?subject=Travel%20agency%20partnership" className="mt-1 block text-[15px] font-bold hover:underline sm:text-[17px]">support@waydidi.com</a>
        </div>
      </div>
    </section>

    {/* Fleet */}
    <section className="py-20" aria-labelledby="fleet-heading">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <h2 id="fleet-heading" className="max-w-[760px] text-[28px] font-bold leading-[1.15] tracking-[-.02em] sm:text-[48px]">Maximum comfort and safety for your clients</h2>
        <p className="mt-5 text-[16px] text-[#555] sm:text-[18px]">Licensed vehicles, professional drivers</p>
      </div>
      <ul className="mx-auto mt-10 flex max-w-[1180px] gap-5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] lg:px-0 [&::-webkit-scrollbar]:hidden">
        {FLEET.map((v) => { const spec = VEHICLES[v.id]; return <li key={v.id} className="relative w-[82%] max-w-[360px] shrink-0 overflow-hidden rounded-[28px] border border-[#E4E1DA] bg-white">
          <div className="grid h-[190px] place-items-center bg-gradient-to-b from-white to-[#F3F2EE] px-6"><Image src={v.image} alt={v.title} width={320} height={180} unoptimized className="max-h-[150px] w-auto object-contain" /></div>
          <div className="p-7 pt-5">
            <p className="text-[17px] font-bold tracking-[-.01em] sm:text-[20px]">{v.title}</p>
            <p className="mt-2 text-[13px] leading-5 text-[#555] sm:text-[15px] sm:leading-6">{v.models}</p>
            <p className="mt-4 flex gap-6 text-[14px] font-semibold"><span className="flex items-center gap-2"><Users size={19} aria-hidden="true" />{spec.passengers}<span className="sr-only">passengers</span></span><span className="flex items-center gap-2"><Luggage size={19} aria-hidden="true" />{spec.bags}<span className="sr-only">bags</span></span></p>
          </div>
        </li>; })}
      </ul>
    </section>

    <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
      {/* Apply */}
      <section id="apply" className="scroll-mt-24 pb-20 pt-20" aria-labelledby="apply-heading">
        <h2 id="apply-heading" className="text-[34px] font-bold leading-[1.15] tracking-[-.02em] sm:text-[52px]">Apply to partner</h2>
        <p className="mb-8 mt-4 max-w-[640px] text-[14px] leading-[23px] text-[#555] sm:text-[17px] sm:leading-7">Tell us about your agency. Our partnerships team replies within 2 working days.</p>
        <AgencyForm />
        <p className="mt-6 flex items-center gap-2 text-[13px] text-[#555]"><FileText size={17} aria-hidden="true" />Questions first? <Link href="/contact" className="font-semibold text-[#111] underline">Contact us</Link></p>
      </section>
    </div>
    {/* Newsletter */}
    <section className="bg-[#0B0B0B] text-white" aria-labelledby="newsletter-heading">
      <div className="mx-auto max-w-[760px] px-5 py-20 lg:px-0">
        <h2 id="newsletter-heading" className="text-[23px] font-bold leading-[1.3] tracking-[-.01em] sm:text-[34px]">Subscribe to the newsletter for travel news and offers</h2>
        <p className="mt-4 text-[13px] text-white/70 sm:text-[16px]">Route tips, new destinations and partner offers, straight to your inbox.</p>
        <NewsletterForm source="agencies" />
        <p className="mt-5 text-[12px] leading-[18px] text-white/60">By subscribing, you agree to our <a href="/privacy" className="underline">privacy policy</a>. We never sell or share your data with third parties. Unsubscribe any time.</p>
      </div>
    </section>
    <PublicFooter />
  </main>;
}

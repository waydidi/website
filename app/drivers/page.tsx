import type { Metadata } from "next";
import Image from "next/image";
import { CalendarCheck2, CreditCard, FileCheck2, Headphones, IdCard, Repeat2, ShieldCheck, Smartphone } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { DriverForm } from "@/components/drivers/driver-form";
import { DriverFaq } from "@/components/drivers/driver-faq";
import { SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Drive with Waydidi | Private transfer driver jobs in Thailand",
  description: "Drive pre-booked airport and intercity transfers in Thailand. Fixed fares shown before you accept, trips planned in advance and a local operations team.",
  alternates: { canonical: `${SITE_URL}/drivers` },
};

// Facts about how Waydidi works (no invented driver counts or ratings).
const FACTS = [
  { value: "Pre-booked", label: "trips confirmed in advance" },
  { value: "Fixed", label: "fare shown before you accept" },
  { value: "Intercity", label: "airport and long-distance routes" },
  { value: "Local", label: "Thai operations team" },
];

const PERKS = [
  { icon: Repeat2, tone: "bg-[#EAF1FF] text-[#3155D6]", title: "Fewer empty drives home", text: "Where we can, we offer you a return booking from your drop-off area, so you're not burning fuel on an empty trip back." },
  { icon: CalendarCheck2, tone: "bg-[#FFF1E0] text-[#C96100]", title: "Plan ahead with pre-scheduled trips", text: "Customers book days or weeks in advance, so you see your trips early and can plan your week with ease." },
  { icon: Headphones, tone: "bg-[#E8F7EE] text-[#0E8A55]", title: "A real team when you need help", text: "Talk to a real person in our operations team about flight delays, changes or anything on the road." },
];

const STEPS = [
  { title: "Register online", text: "Create your application and fill in your details." },
  { title: "Upload your documents", text: "Send your driving licence, ID and vehicle papers for checking." },
  { title: "Meet the team and start driving", text: "A short onboarding call, then you start receiving trip offers." },
];

const APP_STEPS = [
  { title: "Get trips that suit you", text: "Tell us the days and areas you drive, and we offer you trips that fit." },
  { title: "Accept the trips you want", text: "Each trip shows the route, pickup time, vehicle and fare before you say yes." },
  { title: "Make sure you're ready", text: "Your private trip link has the pickup point, passenger name, flight and any special requests." },
  { title: "Keep travellers in the loop", text: "Tap On the way, Arrived and Passenger on board so the customer and our team always know where things stand." },
  { title: "Get paid for every trip", text: "Earnings for completed trips are paid to your bank account on the schedule agreed when you join." },
];

const NEEDS = [
  { icon: IdCard, text: "A valid Thai public (commercial) driving licence" },
  { icon: ShieldCheck, text: "A clean record, and insurance that covers paid passengers" },
  { icon: Smartphone, text: "A smartphone with mobile data for your trip links" },
  { icon: CreditCard, text: "A Thai bank account for your payments" },
];

const FAQ = [
  { q: "Who can drive with Waydidi?", a: "Individual drivers with their own car and fleet owners with several vehicles and drivers. You need the right Thai licence for carrying paying passengers, and a well-kept sedan, SUV or van." },
  { q: "Do I need my own vehicle?", a: "For now, yes, or you need to drive for a fleet owner who works with us. Tell us in the form if you don't have a vehicle yet and we'll let you know if a fleet partner is looking for drivers." },
  { q: "How much can I earn?", a: "Each trip shows its fare before you accept it, so you always know what a job pays. Long-distance and airport trips usually pay more than short city rides. We explain the fare and payment terms during onboarding." },
  { q: "How and when do I get paid?", a: "Earnings for completed trips go to your Thai bank account. The payment schedule is agreed with you when you join." },
  { q: "Which areas do you need drivers in?", a: "Mainly Bangkok and its airports (Suvarnabhumi and Don Mueang), Pattaya, Hua Hin and Phuket, plus drivers for long-distance routes between cities." },
  { q: "Can I choose which trips I take?", a: "Yes. You see the trip details first and only take the ones that fit your schedule." },
  { q: "What documents do I need to upload?", a: "Your ID card or passport, driving licence, vehicle registration and insurance. We may ask for more depending on your vehicle and area." },
  { q: "How long does it take to get approved?", a: "It depends on how quickly your documents are checked. We contact you after reviewing your application to explain the next steps." },
];

export default function DriversPage() {
  return <main className="font-home bg-[#F2F3F7] text-[#111]">
    {/* Hero */}
    <section className="relative isolate overflow-hidden text-white">
      <Image src="/hero-driver-customer.webp" alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover object-[70%_center]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/45 to-black/60" />
      <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-24 sm:pb-20 sm:pt-32 lg:px-0">
        <h1 className="max-w-[720px] text-[30px] font-medium leading-[1.15] tracking-[-.02em] sm:text-[48px]">Earn more on every trip. Drive airport and intercity routes with Waydidi.</h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-[22px] text-white/85 sm:text-[18px] sm:leading-8">Pre-booked private transfers with the fare shown up front. Become a Waydidi driver and plan your work with ease.</p>
        <a href="#apply" className="mt-7 flex h-12 w-full items-center justify-center rounded-full bg-[#FF8A05] text-[16px] font-semibold text-white hover:bg-[#F07A00] sm:w-auto sm:max-w-[320px]">Become a driver</a>
      </div>
    </section>

    {/* Facts */}
    <dl className="mx-auto grid max-w-[1180px] grid-cols-2 gap-x-6 gap-y-6 px-5 py-9 lg:px-0">
      {FACTS.map((f) => <div key={f.label}><dt className="sr-only">{f.label}</dt><dd className="text-[22px] font-medium tracking-[-.02em] sm:text-[30px]">{f.value}</dd><dd className="text-[14px] text-[#555] sm:text-[16px]">{f.label}</dd></div>)}
    </dl>

    {/* Perks */}
    <section className="rounded-t-[32px] bg-white" aria-label="Why drive with Waydidi">
      <ul className="mx-auto grid max-w-[1180px] gap-14 px-5 py-14 sm:grid-cols-3 lg:px-0">
        {PERKS.map(({ icon: Icon, tone, title, text }) => <li key={title}>
          <span className={`grid size-14 place-items-center rounded-2xl ${tone}`}><Icon size={28} strokeWidth={2.2} aria-hidden="true" /></span>
          <p className="mt-6 text-[17px] font-medium sm:text-[20px]">{title}</p>
          <p className="mt-1.5 text-[14px] leading-[21px] text-[#555] sm:text-[16px] sm:leading-7">{text}</p>
        </li>)}
      </ul>
    </section>

    {/* How to get started */}
    <section className="bg-white pb-14" aria-labelledby="start-heading">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <h2 id="start-heading" className="text-[28px] font-medium tracking-[-.02em] sm:text-[40px]">How to get started</h2>
        <p className="mt-2 text-[15px] text-[#333] sm:text-[17px]">Take these easy steps to apply for driving with Waydidi.</p>
      </div>
      <ol className="mx-auto mt-6 flex max-w-[1180px] gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:px-0 [&::-webkit-scrollbar]:hidden">
        {STEPS.map((s, i) => <li key={s.title} className="relative w-[82%] max-w-[360px] shrink-0 overflow-hidden rounded-[24px] bg-[#F2F3F7]">
          <div className="relative grid h-[230px] place-items-center overflow-hidden bg-[#E4E7EC]" aria-hidden="true">
            {i === 0 && <div className="absolute left-1/2 top-6 w-[62%] -translate-x-1/2 rounded-t-[28px] border-[6px] border-b-0 border-[#1B1B1B] bg-[#1B1B1B] p-2 pb-0">
              <p className="px-2 pt-1 text-[11px] font-bold text-white">Waydidi</p>
              <div className="mt-2 rounded-t-[16px] bg-white p-3"><p className="text-[12px] font-semibold">Drive with Waydidi</p><p className="mt-2 flex rounded-full bg-[#EEF0F4] p-0.5 text-[7px]"><span className="flex-1 rounded-full bg-white py-1 text-center font-semibold">Individual driver</span><span className="flex-1 py-1 text-center text-[#777]">Fleet owner</span></p><p className="mt-2 rounded bg-[#F4F5F8] p-1.5 text-[7px] text-[#999]">Email address</p><p className="mt-1 rounded bg-[#F4F5F8] p-1.5 text-[7px] text-[#999]">🇹🇭 +66 Phone number</p><p className="mt-1 rounded bg-[#F4F5F8] p-1.5 text-[7px] text-[#999]">City where you operate</p></div>
            </div>}
            {i === 1 && <div className="relative h-[150px] w-[220px]">
              <span className="absolute left-2 top-4 grid h-[110px] w-[150px] -rotate-6 place-items-center rounded-xl bg-white shadow-md"><IdCard size={54} className="text-[#3155D6]" /></span>
              <span className="absolute right-2 top-10 grid h-[110px] w-[110px] rotate-6 place-items-center rounded-xl bg-white shadow-md"><FileCheck2 size={46} className="text-[#0E8A55]" /></span>
            </div>}
            {i === 2 && <div className="grid size-[120px] place-items-center rounded-full bg-white shadow-md"><Headphones size={54} className="text-[#C96100]" /></div>}
          </div>
          <div className="p-6">
            <span className="rounded-full bg-white px-3 py-1 text-[13px]">Step {i + 1}</span>
            <p className="mt-4 text-[22px] font-medium leading-tight tracking-[-.01em]">{s.title}</p>
            <p className="mt-2 text-[15px] leading-6 text-[#555]">{s.text}</p>
          </div>
        </li>)}
      </ol>
      <div className="mt-8 text-center"><a href="#apply" className="inline-flex h-12 items-center rounded-full bg-[#FF8A05] px-8 text-[16px] font-semibold text-white hover:bg-[#F07A00]">Get started</a></div>
    </section>

    {/* Every step */}
    <section className="rounded-b-[32px] bg-white" aria-labelledby="steps-heading">
      <div className="mx-auto max-w-[1180px] px-5 py-14 lg:px-0">
        <h2 id="steps-heading" className="text-[24px] font-medium tracking-[-.02em] sm:text-[36px]">Handle every step on your phone</h2>
        <p className="mt-2 text-[14px] text-[#333] sm:text-[17px]">See your trips, update your status and keep customers informed.</p>
        <ol className="relative mt-8 grid gap-6">
          <span className="absolute bottom-6 left-[19px] top-6 w-0.5 bg-[#EEF0F4]" aria-hidden="true" />
          {APP_STEPS.map((s, i) => <li key={s.title} className="relative flex gap-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EEF0F4] text-[16px] font-medium">{i + 1}</span>
            <div><p className="text-[17px] font-medium sm:text-[20px]">{s.title}</p><p className="mt-1 text-[14px] leading-[21px] text-[#555] sm:text-[16px] sm:leading-7">{s.text}</p></div>
          </li>)}
        </ol>
      </div>
    </section>

    {/* What you need */}
    <section className="mx-auto max-w-[1180px] px-5 py-14 lg:px-0" aria-labelledby="needs-heading">
      <h2 id="needs-heading" className="text-[22px] font-medium leading-[1.3] tracking-[-.01em] sm:text-[32px]">Be one of our drivers.<br />Here&apos;s what you&apos;ll need.</h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {NEEDS.map(({ icon: Icon, text }) => <li key={text} className="flex items-center gap-4 rounded-[20px] border border-[#E3E5EA] bg-white p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FFF1E0] text-[#C96100]"><Icon size={22} aria-hidden="true" /></span>
          <span className="text-[15px] leading-6">{text}</span>
        </li>)}
      </ul>
    </section>

    {/* Apply */}
    <section id="apply" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pb-14 lg:px-0" aria-labelledby="apply-heading">
      <h2 id="apply-heading" className="text-[28px] font-medium tracking-[-.02em] sm:text-[40px]">Drive with Waydidi</h2>
      <p className="mb-6 mt-2 text-[15px] text-[#333] sm:text-[17px]">Apply in a few minutes. We&apos;ll contact you about documents and onboarding.</p>
      <DriverForm />
    </section>

    {/* FAQ */}
    <section className="bg-white py-12 sm:py-16" aria-labelledby="driver-faq-heading">
      <div className="mx-auto max-w-[760px] px-5">
        <h2 id="driver-faq-heading" className="text-[28px] font-bold leading-[1.1] tracking-[-.03em]">Frequently asked questions</h2>
        <DriverFaq items={FAQ} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }).replace(/</g, "\\u003c") }} />
    </section>
    <PublicFooter />
  </main>;
}

import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Headphones, Mail, MessageCircle, Phone, ShieldCheck, Wallet } from "lucide-react";
import { EmergencyCard } from "@/components/help/emergency-card";
import { HelpTopics, type HelpTopic } from "@/components/help/help-topics";
import { PublicFooter } from "@/components/public-footer";
import { currentCustomer } from "@/lib/customer-auth";
import { SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Customer support | Waydidi",
  description: "Get help with your Waydidi private transfer: find your booking, read common questions, chat with us on WhatsApp or call support.",
  alternates: { canonical: `${SITE_URL}/help` },
};

const SUPPORT_EMAIL = "support@waydidi.com";

// Answers mirror the published policies (FAQ, cancellation, luggage, airport pages).
const TOPICS: HelpTopic[] = [
  { id: "booking", label: "Booking", icon: "route", questions: [
    { q: "When is my booking confirmed?", a: "Your ride is confirmed when Waydidi issues a booking reference and the confirmation page shows your journey details. We also email the confirmation with a PDF." },
    { q: "Can I book for someone else?", a: "Yes. Enter the lead passenger's name and a phone number that works on the day of travel, and keep the booking reference handy." },
    { q: "How do I check my ride?", a: "Open Check your booking and enter the booking reference with the passenger's surname, or sign in to see every trip in your account." },
  ] },
  { id: "airport", label: "Airport pickup", icon: "plane", questions: [
    { q: "Where will I meet the driver at the airport?", a: "Your confirmation shows the pickup instructions. Keep your phone connected after landing; the exact meeting point can vary by terminal." },
    { q: "Do you follow my flight?", a: "When you add a valid flight number, operations can use it to see arrival changes. Please still tell us about major itinerary changes." },
    { q: "What if I can't find my driver?", a: "Stay at the confirmed meeting area, don't move between terminals without telling us, and contact Waydidi with your booking reference and a nearby landmark." },
  ] },
  { id: "changes", label: "Changes & cancellations", icon: "refresh", questions: [
    { q: "How do I change my pickup date or time?", a: "Eligible bookings can request a date or time change from Check your booking until three days before pickup. Changes depend on availability, and your original ride stays in place until we confirm." },
    { q: "How can I cancel my booking?", a: `Email ${SUPPORT_EMAIL} with your booking reference at least 24 hours before pickup. Cancellations are handled personally by email, and your booking stays active until we confirm.` },
    { q: "What if I cancel late or miss the pickup?", a: "Requests inside 24 hours and missed pickups are normally non-refundable because the driver and vehicle are already committed, except where the law requires otherwise or Waydidi cannot provide the service." },
  ] },
  { id: "payment", label: "Payment & receipts", icon: "card", questions: [
    { q: "How do refunds work?", a: "Once Waydidi confirms a refund by email, it goes back through the original payment method where supported. Bank and card processing times are outside our control. Cash bookings have no prepaid amount to refund." },
    { q: "Where can I get a receipt?", a: "Download the PDF from your confirmation page or email, or sign in and open Receipts in your account." },
    { q: "Is the price fixed?", a: "Yes. You see the total for your route and vehicle before you book. Extra stops, waiting or a big destination change may need a revised price agreed in advance." },
  ] },
  { id: "luggage", label: "Luggage", icon: "luggage", questions: [
    { q: "How much luggage can I bring?", a: "Use the capacity shown on each vehicle. A suitcase means a standard checked bag; a carry-on means a cabin-size bag or small backpack." },
    { q: "Can I bring a golf bag, surfboard or wheelchair?", a: "Yes, with advance confirmation. Tell us before travel; measurements and a photo help us match the right vehicle." },
    { q: "What if my luggage doesn't fit?", a: "Drivers can't carry items that block seatbelts or the driver's view. An upgrade or an extra vehicle may be needed at extra cost, so count every bag when booking." },
  ] },
];

const MORE = [
  { label: "All FAQs", href: "/faq" },
  { label: "Airport pickup guide", href: "/airport-pickup-instructions" },
  { label: "Cancellation & refunds", href: "/cancellation-refund-policy" },
  { label: "Luggage policy", href: "/luggage-policy" },
  { label: "Safety & driver standards", href: "/safety-driver-standards" },
  { label: "Terms", href: "/terms" },
];

function digits(value: string | undefined) {
  return (value ?? "").replace(/[^\d]/g, "");
}

export default async function HelpPage() {
  const vars = env as unknown as Record<string, string | undefined>;
  // Chat and Call rows appear only once the numbers are configured.
  const whatsapp = digits(vars.WAYDIDI_WHATSAPP_NUMBER);
  const phone = (vars.WAYDIDI_SUPPORT_PHONE ?? "").trim();
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi Waydidi, I need help with my booking.")}` : null;
  const chatHref = whatsappHref ?? `mailto:${SUPPORT_EMAIL}`;
  const signedIn = Boolean(await currentCustomer());

  const card = "rounded-xl bg-white shadow-[0_2px_12px_rgb(15_23_42/0.06)]";
  const rowLink = `${card} flex items-center gap-3 px-5 py-5 text-xl font-medium text-[#211726] hover:bg-slate-50`;

  return <main className="bg-[#F5F6F8] text-[#211726]">
    {/* Hero */}
    <section className="relative overflow-hidden bg-[#FF8A05] px-5 pb-24 pt-6 text-white">
      <div aria-hidden="true" className="absolute -right-16 -top-10 size-72 rounded-full border-[48px] border-white/10" />
      <div className="relative mx-auto flex max-w-[960px] items-end justify-between gap-6">
        <div>
          <h1 className="text-[38px] font-bold leading-tight tracking-[-.02em] sm:text-5xl">Customer support<span className="text-[#211726]">.</span></h1>
          <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-black/10 px-3 py-2 text-[17px]"><BadgeCheck size={22} aria-hidden="true" />Real people, before, during and after your ride</p>
        </div>
        <div aria-hidden="true" className="hidden shrink-0 place-items-center rounded-full bg-white/15 p-6 sm:grid"><Headphones size={72} strokeWidth={1.5} /></div>
      </div>
    </section>

    <div className="relative mx-auto -mt-16 grid max-w-[960px] grid-cols-[minmax(0,1fr)] gap-4 px-5 pb-16">
      {/* Upcoming trip */}
      <section className={`${card} px-5 py-6 text-center`} aria-labelledby="upcoming">
        <h2 id="upcoming" className="text-xl font-medium">Need help with your upcoming trip?</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/booking/manage" className="flex h-12 items-center justify-center rounded-md border border-[#FF8A05] text-[17px] text-[#C96100] hover:bg-orange-50">Search bookings</Link>
          <Link href={signedIn ? "/account/trips" : "/account/sign-in?next=%2Faccount%2Ftrips"} className="flex h-12 items-center justify-center rounded-md bg-[#FF8A05] text-[17px] text-white hover:bg-[#F07F00]">{signedIn ? "My trips" : "Sign in or register"}</Link>
        </div>
      </section>

      {/* Common questions (informative; replaces Trip.com's service chat) */}
      <section className={`${card} px-5 py-6`} aria-labelledby="questions">
        <h2 id="questions" className="mb-4 text-2xl font-medium">Common questions</h2>
        <HelpTopics topics={TOPICS} chatHref={chatHref} />
        <h3 className="mt-7 text-lg font-medium">More help topics</h3>
        <div className="mt-3 flex flex-wrap gap-2">{MORE.map((m) => <Link key={m.href} href={m.href} className="rounded-md bg-[#F5F6F8] px-4 py-2.5 text-base hover:bg-slate-200">{m.label}</Link>)}</div>
      </section>

      {/* Contact */}
      {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={rowLink}><MessageCircle size={24} className="text-[#25D366]" aria-hidden="true" />Chat with us<span className="ml-auto text-sm font-normal text-slate-500">WhatsApp</span><ChevronRight size={20} className="text-slate-400" aria-hidden="true" /></a>}
      {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={rowLink}><Phone size={24} aria-hidden="true" />Call us<span className="ml-auto text-sm font-normal text-slate-500">{phone}</span><ChevronRight size={20} className="text-slate-400" aria-hidden="true" /></a>}
      <a href={`mailto:${SUPPORT_EMAIL}`} className={rowLink}><Mail size={24} aria-hidden="true" />Email us<span className="ml-auto truncate text-sm font-normal text-slate-500">{SUPPORT_EMAIL}</span><ChevronRight size={20} className="shrink-0 text-slate-400" aria-hidden="true" /></a>
      <EmergencyCard />

      {/* Reassurance */}
      <section className="rounded-xl bg-gradient-to-r from-[#FFF0DF] to-white px-5 py-6" aria-labelledby="worry-free">
        <h2 id="worry-free" className="flex items-center gap-3 text-xl font-medium"><ShieldCheck size={26} className="text-[#FF8A05]" aria-hidden="true" />Travel worry-free with Waydidi</h2>
        <p className="mt-3 text-base leading-7 text-slate-600">Every ride has one booking record with your route, pickup time, vehicle and price, and our operations team follows it from driver assignment to drop-off. <Link href="/safety-driver-standards" className="text-[#C96100] hover:underline">Learn more</Link></p>
      </section>

      <section className="px-1 pt-4" aria-labelledby="rely">
        <h2 id="rely" className="text-2xl font-medium">Service you can rely on</h2>
        <ul className="mt-6 grid gap-7">
          {[
            { icon: ShieldCheck, title: "Private and safe", text: "One vehicle for your group, with vetted local drivers and journey checks.", href: "/safety-driver-standards" },
            { icon: Wallet, title: "Price you see before you book", text: "A fixed total for your route and vehicle, with no haggling at the curb.", href: "/a-to-b-transfer" },
            { icon: BadgeCheck, title: "Clear rules when plans change", text: "Date changes up to three days before pickup; cancellations handled personally by email.", href: "/cancellation-refund-policy" },
          ].map(({ icon: Icon, title, text, href }) => <li key={title} className="flex gap-4">
            <Icon size={28} className="mt-0.5 shrink-0 text-[#FF8A05]" aria-hidden="true" />
            <div><h3 className="text-xl font-medium">{title}</h3><p className="mt-1 text-base leading-7 text-slate-600">{text} <Link href={href} className="text-[#C96100] hover:underline">Learn more</Link></p></div>
          </li>)}
        </ul>
      </section>
    </div>
    <PublicFooter />
  </main>;
}

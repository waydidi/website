import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  Check,
  Clock3,
  Headphones,
  Luggage,
  MapPin,
  Plane,
  Route,
  ShieldCheck,
} from "lucide-react";
import { BookingFlow } from "@/components/home/booking-flow";
import { Breadcrumbs } from "@/components/seo";
import { PublicFooter } from "@/components/public-footer";
import { SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Suvarnabhumi Airport Transfer (BKK) | Waydidi",
  description:
    "Book a private transfer from Suvarnabhumi Airport to Bangkok, Pattaya, Ayutthaya, Hua Hin and destinations across Thailand.",
  alternates: { canonical: `${SITE_URL}/airport-transfer` },
  openGraph: {
    title: "Suvarnabhumi Airport Transfer (BKK) | Waydidi",
    description:
      "Private airport pickup with clear meeting instructions, fixed pricing and a vehicle for your group.",
    url: `${SITE_URL}/airport-transfer`,
    type: "website",
  },
};

const transferCards = [
  { title: "Bangkok city transfer", text: "A private ride from BKK to Sukhumvit, Silom, Sathorn, riverside hotels and other Bangkok districts.", href: "/destinations/bangkok", icon: MapPin },
  { title: "Pattaya transfer", text: "Travel directly from the airport to Pattaya, Jomtien or your Eastern Seaboard hotel.", href: "/destinations/pattaya", icon: Route },
  { title: "Long-distance transfer", text: "Continue from Suvarnabhumi to Hua Hin, Ayutthaya, Kanchanaburi or another Thai destination.", href: "/long-journeys", icon: CarFront },
];

const trips = [
  { name: "Bangkok", note: "Hotels, homes and business districts", href: "/destinations/bangkok", image: "/hero-driver-customer.webp" },
  { name: "Pattaya", note: "Beachfront hotels and Jomtien", href: "/destinations/pattaya", image: "/waydidi-transfer.png" },
  { name: "Ayutthaya", note: "Historic city and riverside stays", href: "/destinations/ayutthaya", image: "/service-daytrip.png" },
  { name: "Hua Hin", note: "Private ride to the Gulf coast", href: "/destinations/hua-hin", image: "/service-reserve.png" },
];

const guides = [
  { title: "Airport pickup instructions", text: "Follow the arrival checklist and find the confirmed meeting point.", href: "/airport-pickup-instructions", icon: Plane },
  { title: "Luggage policy", text: "Match your suitcases and carry-ons to the right vehicle capacity.", href: "/luggage-policy", icon: Luggage },
  { title: "Frequently asked questions", text: "Read practical answers about waiting, delays, changes and payment.", href: "/faq", icon: Headphones },
];

const vehicles = [
  { name: "Economy sedan", capacity: "1–3 passengers · 2 bags", image: "/vehicle-economy-sedan.webp" },
  { name: "Comfort SUV", capacity: "1–4 passengers · 4 bags", image: "/vehicle-comfort-suv.webp" },
  { name: "Premium minivan", capacity: "Larger groups · extra luggage", image: "/vehicle-premium-minivan.webp" },
];

export default function SuvarnabhumiAirportPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Suvarnabhumi Airport private transfer",
    provider: { "@type": "Organization", name: "Waydidi", url: SITE_URL },
    areaServed: { "@type": "Country", name: "Thailand" },
    serviceType: "Private airport transfer",
    url: `${SITE_URL}/airport-transfer`,
  };

  return <BookingFlow hero={{title:"Private airport transfers in Thailand",subtitle:"Pre-book your airport pickup or drop-off with a fixed price, a confirmed vehicle and a driver who meets you at arrivals.",image:"/service-ride-airport.webp",top:<Breadcrumbs crumbs={[{name:"Home",path:"/"},{name:"Airport transfer",path:"/airport-transfer"}]} className="text-white"/>}}><main className="bg-white text-plum">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

    <nav aria-label="Suvarnabhumi Airport page sections" className="sticky top-[79px] lg:top-[107px] z-30 border-y border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1260px] gap-8 overflow-x-auto px-5 py-5 text-sm font-black sm:text-base lg:px-8">
        <a href="#transfer-service" className="whitespace-nowrap text-brand-text">Transfer service</a>
        <a href="#trips" className="whitespace-nowrap hover:text-brand-text">Trip from Suvarnabhumi Airport</a>
        <a href="#guides" className="whitespace-nowrap hover:text-brand-text">Guides</a>
        <a href="#transport" className="whitespace-nowrap hover:text-brand-text">Transport</a>
      </div>
    </nav>

    <section id="transfer-service" className="scroll-mt-44 mx-auto max-w-[1260px] px-5 py-16 lg:px-8">
      <div className="max-w-3xl"><p className="text-sm font-black uppercase tracking-[.18em] text-brand-text">Transfer service</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Book your airport ride before you fly.</h2><p className="mt-5 text-lg leading-8 text-slate-600">Choose your exact pickup, destination, travel time, passengers and luggage. Waydidi shows the suitable vehicle options before checkout.</p></div>
      <div className="mt-9 grid gap-5 md:grid-cols-3">{transferCards.map(({title,text,href,icon:Icon})=><a key={title} href={href} className="group rounded-[26px] bg-canvas p-6 transition hover:-translate-y-1 hover:shadow-xl"><span className="grid size-12 place-items-center rounded-full bg-brand-tint text-brand-text"><Icon/></span><h3 className="mt-7 text-2xl font-black">{title}</h3><p className="mt-3 min-h-[84px] leading-7 text-slate-600">{text}</p><span className="mt-6 inline-flex items-center gap-2 font-black text-brand-text">View service <ArrowRight size={17} className="transition group-hover:translate-x-1"/></span></a>)}</div>
      <div className="mt-8 grid gap-4 rounded-[26px] bg-[#FFF5E9] p-6 sm:grid-cols-2 lg:grid-cols-4">{[[ShieldCheck,"Professional driver"],[Clock3,"Confirmed pickup time"],[BadgeCheck,"Clear booking details"],[Headphones,"Customer support"]].map(([Icon,label])=>{const I=Icon as typeof ShieldCheck;return <div key={label as string} className="flex items-center gap-3 font-bold"><I className="text-brand-text"/><span>{label as string}</span></div>})}</div>
    </section>

    <section id="trips" className="scroll-mt-44 bg-canvas py-16"><div className="mx-auto max-w-[1260px] px-5 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-black uppercase tracking-[.18em] text-brand-text">Trip from Suvarnabhumi Airport</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Popular onward destinations</h2></div><Link href="/destinations" className="inline-flex items-center gap-2 font-black text-brand-text">All destinations <ArrowRight size={18}/></Link></div><div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{trips.map(t=><a key={t.name} href={t.href} className="group overflow-hidden rounded-[24px] bg-white shadow-sm"><div className="relative h-52 overflow-hidden bg-orange-100"><Image src={t.image} alt={`${t.name} transfer from Suvarnabhumi Airport`} fill className="object-cover transition duration-500 group-hover:scale-105"/></div><div className="p-5"><h3 className="text-2xl font-black">{t.name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{t.note}</p></div></a>)}</div></div></section>

    <section id="guides" className="scroll-mt-44 mx-auto max-w-[1260px] px-5 py-16 lg:px-8"><p className="text-sm font-black uppercase tracking-[.18em] text-brand-text">Guides</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Arrive knowing exactly what to do.</h2><div className="mt-9 grid gap-5 lg:grid-cols-3">{guides.map(({title,text,href,icon:Icon})=><a href={href} key={title} className="flex min-h-56 flex-col rounded-[24px] border border-slate-200 p-6 hover:border-brand"><Icon className="text-brand-text"/><h3 className="mt-7 text-2xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-600">{text}</p><span className="mt-auto pt-6 font-black text-brand-text">Read guide →</span></a>)}</div></section>

    <section id="transport" className="scroll-mt-44 bg-plum py-16 text-white"><div className="mx-auto max-w-[1260px] px-5 lg:px-8"><p className="text-sm font-black uppercase tracking-[.18em] text-[#FF9A24]">Transport</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">A vehicle for your people and bags.</h2><div className="mt-9 grid gap-5 md:grid-cols-3">{vehicles.map(v=><div key={v.name} className="overflow-hidden rounded-[24px] bg-white text-plum"><div className="relative h-52 bg-[#FFF5E9]"><Image src={v.image} alt={v.name} fill className="object-contain p-5"/></div><div className="p-6"><h3 className="text-2xl font-black">{v.name}</h3><p className="mt-2 font-semibold text-slate-600">{v.capacity}</p><div className="mt-5 flex items-center gap-2 text-sm font-bold text-brand-text"><Check size={17}/> Shown when suitable for your booking</div></div></div>)}</div></div></section>

    <section className="mx-auto max-w-[1260px] px-5 py-16 lg:px-8"><div className="grid gap-8 rounded-[30px] bg-brand p-7 text-white md:grid-cols-[1fr_auto] md:items-center md:p-11"><div><p className="text-sm font-black uppercase tracking-[.18em] text-white/70">Ready to travel?</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em]">Search your Suvarnabhumi transfer.</h2><p className="mt-3 max-w-2xl text-lg text-white/85">Enter the exact airport terminal or meeting point and your destination to see available vehicle categories.</p></div><a href="#booking-search" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-black text-brand-darker">Search transfers <ArrowRight size={18}/></a></div></section>

    <PublicFooter/>
  </main></BookingFlow>;
}

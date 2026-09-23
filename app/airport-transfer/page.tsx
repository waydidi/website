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

  return <main className="bg-white text-[#211726]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

    <section className="mx-auto max-w-[1320px] px-5 pb-8 pt-6 lg:px-8">
      <div className="mb-5 text-sm font-semibold text-slate-500"><a href="/" className="hover:text-[#D96F00]">Home</a><span className="mx-2">/</span>Suvarnabhumi Airport</div>
      <div className="grid overflow-hidden rounded-[30px] bg-[#211726] text-white lg:grid-cols-[1.08fr_.92fr]">
        <div className="flex flex-col justify-center px-7 py-12 sm:px-11 lg:px-14 lg:py-16">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black"><Plane size={17} className="text-[#FF9A24]"/> Bangkok · BKK</span>
          <h1 className="mt-6 text-5xl font-black tracking-[-.055em] sm:text-6xl lg:text-7xl">Suvarnabhumi Airport</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/75">Start or finish your Thailand journey with a private airport transfer, a confirmed pickup plan and space for your whole group.</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="/#booking-search" className="inline-flex items-center gap-2 rounded-full bg-[#FF8A05] px-6 py-4 font-black text-white">Search airport transfers <ArrowRight size={18}/></a><a href="#transfer-service" className="inline-flex items-center rounded-full border border-white/25 px-6 py-4 font-black">Explore services</a></div>
        </div>
        <div className="relative min-h-[360px] bg-[#FF8A05] lg:min-h-[510px]">
          <Image src="/waydidi-transfer.png" alt="Private Waydidi airport transfer vehicle in Thailand" fill priority className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#211726]/60 via-transparent to-transparent"/>
          <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white/95 p-5 text-[#211726] shadow-xl backdrop-blur">
            <div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 shrink-0 text-[#D96F00]"/><div><strong className="block">Private pickup, planned before arrival</strong><span className="mt-1 block text-sm text-slate-600">Clear booking details · local operations · support when plans change</span></div></div>
          </div>
        </div>
      </div>
    </section>

    <nav aria-label="Suvarnabhumi Airport page sections" className="sticky top-[102px] z-30 border-y border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1260px] gap-8 overflow-x-auto px-5 py-5 text-sm font-black sm:text-base lg:px-8">
        <a href="#transfer-service" className="whitespace-nowrap text-[#D96F00]">Transfer service</a>
        <a href="#trips" className="whitespace-nowrap hover:text-[#D96F00]">Trip from Suvarnabhumi Airport</a>
        <a href="#guides" className="whitespace-nowrap hover:text-[#D96F00]">Guides</a>
        <a href="#transport" className="whitespace-nowrap hover:text-[#D96F00]">Transport</a>
      </div>
    </nav>

    <section id="transfer-service" className="scroll-mt-44 mx-auto max-w-[1260px] px-5 py-16 lg:px-8">
      <div className="max-w-3xl"><p className="text-sm font-black uppercase tracking-[.18em] text-[#D96F00]">Transfer service</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Book your airport ride before you fly.</h2><p className="mt-5 text-lg leading-8 text-slate-600">Choose your exact pickup, destination, travel time, passengers and luggage. Waydidi shows the suitable vehicle options before checkout.</p></div>
      <div className="mt-9 grid gap-5 md:grid-cols-3">{transferCards.map(({title,text,href,icon:Icon})=><a key={title} href={href} className="group rounded-[26px] bg-[#F5F6F8] p-6 transition hover:-translate-y-1 hover:shadow-xl"><span className="grid size-12 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><Icon/></span><h3 className="mt-7 text-2xl font-black">{title}</h3><p className="mt-3 min-h-[84px] leading-7 text-slate-600">{text}</p><span className="mt-6 inline-flex items-center gap-2 font-black text-[#D96F00]">View service <ArrowRight size={17} className="transition group-hover:translate-x-1"/></span></a>)}</div>
      <div className="mt-8 grid gap-4 rounded-[26px] bg-[#FFF5E9] p-6 sm:grid-cols-2 lg:grid-cols-4">{[[ShieldCheck,"Professional driver"],[Clock3,"Confirmed pickup time"],[BadgeCheck,"Clear booking details"],[Headphones,"Customer support"]].map(([Icon,label])=>{const I=Icon as typeof ShieldCheck;return <div key={label as string} className="flex items-center gap-3 font-bold"><I className="text-[#D96F00]"/><span>{label as string}</span></div>})}</div>
    </section>

    <section id="trips" className="scroll-mt-44 bg-[#F5F6F8] py-16"><div className="mx-auto max-w-[1260px] px-5 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-black uppercase tracking-[.18em] text-[#D96F00]">Trip from Suvarnabhumi Airport</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Popular onward destinations</h2></div><a href="/destinations" className="inline-flex items-center gap-2 font-black text-[#D96F00]">All destinations <ArrowRight size={18}/></a></div><div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{trips.map(t=><a key={t.name} href={t.href} className="group overflow-hidden rounded-[24px] bg-white shadow-sm"><div className="relative h-52 overflow-hidden bg-orange-100"><Image src={t.image} alt={`${t.name} transfer from Suvarnabhumi Airport`} fill className="object-cover transition duration-500 group-hover:scale-105"/></div><div className="p-5"><h3 className="text-2xl font-black">{t.name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{t.note}</p></div></a>)}</div></div></section>

    <section id="guides" className="scroll-mt-44 mx-auto max-w-[1260px] px-5 py-16 lg:px-8"><p className="text-sm font-black uppercase tracking-[.18em] text-[#D96F00]">Guides</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Arrive knowing exactly what to do.</h2><div className="mt-9 grid gap-5 lg:grid-cols-3">{guides.map(({title,text,href,icon:Icon})=><a href={href} key={title} className="flex min-h-56 flex-col rounded-[24px] border border-slate-200 p-6 hover:border-[#FF8A05]"><Icon className="text-[#D96F00]"/><h3 className="mt-7 text-2xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-600">{text}</p><span className="mt-auto pt-6 font-black text-[#D96F00]">Read guide →</span></a>)}</div></section>

    <section id="transport" className="scroll-mt-44 bg-[#211726] py-16 text-white"><div className="mx-auto max-w-[1260px] px-5 lg:px-8"><p className="text-sm font-black uppercase tracking-[.18em] text-[#FF9A24]">Transport</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">A vehicle for your people and bags.</h2><div className="mt-9 grid gap-5 md:grid-cols-3">{vehicles.map(v=><div key={v.name} className="overflow-hidden rounded-[24px] bg-white text-[#211726]"><div className="relative h-52 bg-[#FFF5E9]"><Image src={v.image} alt={v.name} fill className="object-contain p-5"/></div><div className="p-6"><h3 className="text-2xl font-black">{v.name}</h3><p className="mt-2 font-semibold text-slate-600">{v.capacity}</p><div className="mt-5 flex items-center gap-2 text-sm font-bold text-[#D96F00]"><Check size={17}/> Shown when suitable for your booking</div></div></div>)}</div></div></section>

    <section className="mx-auto max-w-[1260px] px-5 py-16 lg:px-8"><div className="grid gap-8 rounded-[30px] bg-[#FF8A05] p-7 text-white md:grid-cols-[1fr_auto] md:items-center md:p-11"><div><p className="text-sm font-black uppercase tracking-[.18em] text-white/70">Ready to travel?</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em]">Search your Suvarnabhumi transfer.</h2><p className="mt-3 max-w-2xl text-lg text-white/85">Enter the exact airport terminal or meeting point and your destination to see available vehicle categories.</p></div><a href="/#booking-search" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-black text-[#C96100]">Search transfers <ArrowRight size={18}/></a></div></section>

    <PublicFooter/>
  </main>;
}

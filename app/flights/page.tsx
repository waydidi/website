import type { Metadata } from "next";
import { ChevronDown, Plane } from "lucide-react";
import { FlightStatusSearch } from "@/components/flights/flight-status";
import { PublicFooter } from "@/components/public-footer";
import { Breadcrumbs, JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo";
import { SITE_URL } from "@/lib/public-content";
import { POPULAR_ROUTES, THAI_AIRLINES, THAI_AIRPORTS, airportByCode } from "@/lib/thai-flights";

const URL_PATH = "/flights";
export const metadata: Metadata = {
  title: "Flight Status Thailand – Arrivals & Departures | Waydidi",
  description: "Check the live status of domestic Thai flights and flights to and from Thailand by flight number or route. Then book your airport transfer.",
  alternates: { canonical: `${SITE_URL}${URL_PATH}` },
};

const FAQ = [
  { q: "Which flights can I check?", a: "Domestic flights within Thailand and international flights arriving in or departing from Thailand." },
  { q: "Is the flight status updated in real time?", a: "Flight times come from airline and airport data and are refreshed every few minutes. Always check with your airline for gate changes and boarding times." },
  { q: "Do I need to tell Waydidi if my flight is delayed?", a: "Add your flight number when you book an airport pickup, so your driver can check your landing time. If your plans change, message us on WhatsApp." },
  { q: "What times are shown?", a: "All times are shown in Thailand time (GMT+7)." },
];

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <section className="py-9"><h2 className="text-[26px] font-black tracking-[-.03em]">{title}</h2><p className="mt-2 text-slate-600">{sub}</p><div className="mt-5">{children}</div></section>;
}

export default function FlightsPage() {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Flight status", path: URL_PATH }];
  const card = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";
  return <main className="bg-white text-[#211726]">
    <JsonLd data={[breadcrumbSchema(crumbs), faqSchema(FAQ)]} />
    <section className="bg-[#FE8B05]"><div className="mx-auto max-w-[1080px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <Breadcrumbs crumbs={crumbs} className="text-white/90" />
      <h1 className="mt-4 text-[34px] font-black leading-[1.05] tracking-[-.04em] text-white sm:text-5xl">Flight status</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-white/95">Track domestic Thai flights and flights to and from Thailand by flight number or route.</p>
    </div></section>

    <div className="mx-auto -mt-16 max-w-[1080px] px-4 sm:px-6 lg:px-8">
      <FlightStatusSearch />

      <Section title="Thailand's airports" sub="Arrivals and departures at airports across Thailand">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{THAI_AIRPORTS.map((a) => <li key={a.code} className={`${card} flex items-center gap-4`}>
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#FFF6EC] text-sm font-black text-[#C96100]">{a.code}</span>
          <div className="min-w-0"><p className="font-bold leading-tight">{a.name}</p><p className="text-sm text-slate-500">{a.city}</p></div>
        </li>)}</ul>
      </Section>

      <Section title="Airlines flying in Thailand" sub="Thai airlines for domestic and regional flights">
        <ul className="grid gap-3 sm:grid-cols-2">{THAI_AIRLINES.map((a) => <li key={a.code} className={`${card} flex items-center gap-4`}>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-black text-slate-700">{a.code}</span>
          <p className="font-bold">{a.name} ({a.code})</p>
        </li>)}</ul>
      </Section>

      <Section title="Popular flight routes in Thailand" sub="Busy domestic routes travellers fly every day">
        <ol className="grid gap-3">{POPULAR_ROUTES.map(([from, to], i) => <li key={`${from}${to}`} className={`${card} flex items-center gap-4`}>
          <span className="w-6 text-lg font-black text-slate-400">{i + 1}</span>
          <div className="min-w-0 flex-1"><p className="font-bold">{airportByCode(from)?.city} – {airportByCode(to)?.city}</p><p className="text-sm text-slate-500">{from} to {to}</p></div>
          <Plane size={20} className="shrink-0 text-[#FE8B05]" />
        </li>)}</ol>
      </Section>

      <section className="my-6 grid gap-5 rounded-[24px] bg-[#211726] p-7 text-white md:grid-cols-[1fr_auto] md:items-center md:p-10">
        <div><h2 className="text-[26px] font-black tracking-[-.03em]">Landing soon? Your driver will be waiting</h2><p className="mt-2 text-white/80">Private airport transfers across Thailand. Add your flight number and your driver checks your landing time.</p></div>
        <a href="/airport-transfer" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#FE8B05] px-6 font-bold text-white hover:bg-[#E67900]">Book an airport transfer</a>
      </section>

      <Section title="Frequently asked questions" sub="About flight status on Waydidi">
        <div className="divide-y divide-slate-200 border-y border-slate-200">{FAQ.map((f) => <details key={f.q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">{f.q}<ChevronDown size={20} className="shrink-0 transition group-open:rotate-180" /></summary>
          <p className="mt-3 leading-7 text-slate-700">{f.a}</p>
        </details>)}</div>
      </Section>
    </div>
    <PublicFooter />
  </main>;
}

import type { Metadata } from "next";
import { ChevronDown, ChevronLeft, Plane } from "lucide-react";
import { FlightStatusSearch } from "@/components/flights/flight-status";
import { PublicFooter } from "@/components/public-footer";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo";
import { SITE_URL } from "@/lib/public-content";
import { latestStats } from "@/lib/aerodatabox";
import { POPULAR_ROUTES, THAI_AIRLINES, THAI_AIRPORTS, airportByCode, airportLabel } from "@/lib/thai-flights";

export const dynamic = "force-dynamic";
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
  return <section className="py-9"><h2 className="text-[24px] font-bold">{title}</h2><p className="mt-2 text-slate-600">{sub}</p><div className="mt-5">{children}</div></section>;
}

export default async function FlightsPage() {
  const stats = await latestStats();
  const dayName = stats ? new Date(`${stats.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : "";
  const crumbs = [{ name: "Home", path: "/" }, { name: "Flight status", path: URL_PATH }];
  const card = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";
  return <main className="font-home bg-white text-[#211726]">
    <JsonLd data={[breadcrumbSchema(crumbs), faqSchema(FAQ)]} />
    {/* App-style top (like Trip.com): no site header, back arrow + title, search card over the colour. */}
    <div className="bg-[linear-gradient(180deg,#FE8B05_0%,#FFA33D_45%,#FFE3C2_80%,#FFFFFF_100%)]">
      <div className="mx-auto max-w-[1080px] px-4 pb-6 pt-[calc(14px+env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <div className="flex h-12 items-center gap-3">
          <a href="/" aria-label="Back to homepage" className="-ml-2 grid size-10 place-items-center rounded-full text-white hover:bg-white/15"><ChevronLeft size={30} strokeWidth={1.8} /></a>
          <h1 className="text-[22px] font-semibold text-white">Flight status</h1>
        </div>
        <div className="mt-12">
      <FlightStatusSearch />
        </div>
      </div>
    </div>
    <div className="mx-auto max-w-[1080px] px-4 sm:px-6 lg:px-8">

      {stats && stats.airports.some((a) => a.flights) ? <>
        <Section title="Airport tracker" sub={`Departures at Thailand's busiest airports yesterday (${dayName})`}>
          <ol className="grid gap-3">{stats.airports.map((a, i) => <li key={a.iata} className={`${card} grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 sm:gap-6`}>
            <span className="text-lg font-black text-slate-400">{i + 1}</span>
            <div className="min-w-0"><p className="font-bold leading-tight">{airportByCode(a.iata)?.name ?? a.iata}</p><p className="text-sm text-slate-500">{a.iata}</p></div>
            <div className="text-right"><p className="text-lg font-black">{a.flights}</p><p className="text-xs text-slate-500">Departures</p></div>
            <div className="text-right"><p className="text-lg font-black text-[#2F7A6B]">{a.onTime === null ? "–" : `${a.onTime}%`}</p><p className="text-xs text-slate-500">On-time</p></div>
          </li>)}</ol>
        </Section>
        <Section title="Airline departures" sub="Airlines with the most departures from these airports yesterday">
          <ul className="grid gap-3 sm:grid-cols-2">{stats.airlines.map((a) => <li key={a.name} className={`${card} flex items-center justify-between gap-4`}>
            <div className="min-w-0"><p className="font-bold">{a.name}</p><p className="text-sm text-slate-500">On-time departures: {a.onTime === null ? "–" : `${a.onTime}%`}</p></div>
            <div className="shrink-0 text-right"><p className="text-lg font-black">{a.flights}</p><p className="text-xs text-slate-500">Flights</p></div>
          </li>)}</ul>
        </Section>
        <Section title="Busiest routes from Thailand" sub="Routes with the most departures yesterday">
          <ol className="grid gap-3">{stats.routes.map((r, i) => <li key={r.from + r.to} className={`${card} flex items-center gap-4`}>
            <span className="w-6 text-lg font-black text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1"><p className="font-bold">{airportLabel(r.from)} – {airportLabel(r.to)}</p><p className="truncate text-sm text-slate-500">{r.from} to {r.to}{r.topAirline ? ` | Most flights: ${r.topAirline}` : ""}</p></div>
            <div className="shrink-0 text-right"><p className="text-lg font-black">{r.flights}</p><p className="text-xs text-slate-500">Flights</p></div>
          </li>)}</ol>
        </Section>
      </> : <>
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

      </>}

      <section className="my-6 grid gap-5 rounded-[24px] bg-[#211726] p-7 text-white md:grid-cols-[1fr_auto] md:items-center md:p-10">
        <div><h2 className="text-[24px] font-bold">Landing soon? Your driver will be waiting</h2><p className="mt-2 text-white/80">Private airport transfers across Thailand. Add your flight number and your driver checks your landing time.</p></div>
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

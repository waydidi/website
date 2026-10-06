"use client";

import { Plane, Search } from "lucide-react";
import { useState } from "react";
import { THAI_AIRLINES, THAI_AIRPORTS, cleanFlightNumber } from "@/lib/thai-flights";

type Mode = "flight" | "airport" | "airline";
type Point = { iata: string | null; airport: string | null; city: string | null; scheduled: string | null; revised: string | null; actual: string | null; terminal: string | null; gate: string | null; belt: string | null };
type Result = { flightNumber: string; date: string; status: string; airline: string | null; aircraft: string | null; departure: Point; arrival: Point; checkedAt: string };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
// Airport local time as sent ("2026-10-06 12:45+07:00") → "12:45".
const hhmm = (local: string | null) => local?.match(/\d{2}:\d{2}/)?.[0] ?? "–";
const STATUS: Record<string, [string, string]> = {
  Expected: ["Scheduled", "bg-slate-100 text-slate-700"], CheckIn: ["Check-in", "bg-slate-100 text-slate-700"], Boarding: ["Boarding", "bg-sky-100 text-sky-800"],
  GateClosed: ["Gate closed", "bg-sky-100 text-sky-800"], Departed: ["Departed", "bg-sky-100 text-sky-800"], EnRoute: ["In the air", "bg-sky-100 text-sky-800"],
  Approaching: ["Landing soon", "bg-sky-100 text-sky-800"], Delayed: ["Delayed", "bg-amber-100 text-amber-800"], Diverted: ["Diverted", "bg-amber-100 text-amber-800"],
  Arrived: ["Landed", "bg-emerald-100 text-emerald-800"], Landed: ["Landed", "bg-emerald-100 text-emerald-800"],
  Canceled: ["Cancelled", "bg-red-100 text-red-700"], CanceledUncertain: ["May be cancelled", "bg-red-100 text-red-700"],
};
const status = (s: string) => STATUS[s] ?? ["Scheduled", "bg-slate-100 text-slate-700"];

function Side({ label, p }: { label: string; p: Point }) {
  const changed = p.revised && p.scheduled && hhmm(p.revised) !== hhmm(p.scheduled);
  // Same-day "HH:MM" strings compare correctly; later than planned is amber, earlier is green.
  const late = changed && hhmm(p.revised) > hhmm(p.scheduled);
  const gate = p.gate && !/^(ARR|DEP|N\/?A|-)$/i.test(p.gate) ? p.gate : null;
  return <div className="min-w-0">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black">{p.iata ?? "–"}</p>
    <p className="truncate text-sm text-slate-600">{p.city ?? p.airport ?? ""}</p>
    <p className="mt-2 text-lg font-bold">{changed ? <><span className="mr-2 text-sm font-normal text-slate-400 line-through">{hhmm(p.scheduled)}</span><span className={late ? "text-amber-700" : "text-emerald-700"}>{hhmm(p.revised)}</span></> : hhmm(p.actual ?? p.revised ?? p.scheduled)}</p>
    <p className="mt-1 text-sm text-slate-600">{[p.terminal && `Terminal ${p.terminal}`, gate && `Gate ${gate}`, p.belt && `Belt ${p.belt}`].filter(Boolean).join(" · ") || "\u00a0"}</p>
  </div>;
}

export function FlightStatusSearch() {
  const [mode, setMode] = useState<Mode>("flight");
  const [flight, setFlight] = useState("");
  const [date, setDate] = useState(today);
  const [airport, setAirport] = useState("");
  const [airline, setAirline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [notice, setNotice] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setResults([]); setNotice("");
    if (mode === "flight") {
      const no = cleanFlightNumber(flight);
      if (!no) { setError("Enter a flight number, e.g. TG103 or FD3010."); return; }
      setBusy(true);
      try {
        const res = await fetch("/api/flights/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightNumber: no, date }) });
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "Flight status is unavailable right now.");
        else setResults(data.flights ?? []);
      } catch { setError("Flight status is unavailable right now."); }
      setBusy(false);
      return;
    }
    if (mode === "airport" && !airport) { setError("Choose an airport."); return; }
    if (mode === "airline" && !airline) { setError("Choose an airline."); return; }
    const name = mode === "airport" ? THAI_AIRPORTS.find((a) => a.code === airport)?.name : THAI_AIRLINES.find((a) => a.code === airline)?.name;
    setNotice(`Live departures and arrivals for ${name} are coming soon. For now, search by flight number.`);
  }

  const radio = (m: Mode, label: string) => <label className="flex cursor-pointer items-center gap-2 text-[16px] text-[#211726]">
    <input type="radio" name="mode" checked={mode === m} onChange={() => { setMode(m); setError(""); setNotice(""); setResults([]); }} className="size-5 accent-[#FE8B05]" />{label}
  </label>;
  const field = "h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-[16px] text-[#211726] outline-none placeholder:text-slate-400 focus:border-[#FE8B05] focus:ring-2 focus:ring-[#FE8B05]/20";

  return <div>
    <form onSubmit={search} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap gap-x-7 gap-y-3" role="radiogroup" aria-label="Search by">{radio("flight", "Flight no.")}{radio("airport", "Airport")}{radio("airline", "Airline")}</div>
      <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        {mode === "flight" && <input value={flight} onChange={(e) => setFlight(e.target.value)} placeholder="Enter your flight number" aria-label="Flight number" autoCapitalize="characters" className={field} />}
        {mode === "airport" && <select value={airport} onChange={(e) => setAirport(e.target.value)} aria-label="Airport" className={field}><option value="">Choose a Thai airport</option>{THAI_AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.city} – {a.name} ({a.code})</option>)}</select>}
        {mode === "airline" && <select value={airline} onChange={(e) => setAirline(e.target.value)} aria-label="Airline" className={field}><option value="">Choose an airline</option>{THAI_AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}</select>}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={`${field} block min-w-0 appearance-none sm:w-[180px]`} />
      </div>
      <button type="submit" disabled={busy} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FE8B05] text-[18px] font-bold text-white transition hover:bg-[#E67900] disabled:opacity-60"><Search size={22} />{busy ? "Searching…" : "Search"}</button>
      {error && <p role="alert" className="mt-3 text-[15px] text-red-600">{error}</p>}
      {notice && <p role="status" className="mt-3 text-[15px] text-slate-600">{notice}</p>}
    </form>

    {results.map((r, i) => <div key={i} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xl font-black">{r.flightNumber}</p><p className="text-slate-600">{[r.airline, r.aircraft].filter(Boolean).join(" · ")}</p></div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${status(r.status)[1]}`}>{status(r.status)[0]}</span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <Side label="Departure" p={r.departure} />
        <Plane className="mt-8 text-[#FE8B05]" size={22} />
        <div className="text-right [&_p]:ml-auto"><Side label="Arrival" p={r.arrival} /></div>
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Local airport times. Updated {new Date(r.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} (Thailand time). Check with your airline for boarding and gate changes.</p>
      <a href="/airport-transfer" className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-[#FE8B05] px-3 text-center font-bold text-[#C96100] hover:bg-[#FFF6EC]">Need a ride{r.arrival.city ? ` in ${r.arrival.city}` : ""}? Book an airport transfer</a>
    </div>)}
  </div>;
}

"use client";

import { CalendarDays, Plane, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { FlightMap } from "@/components/flights/flight-map";
import { THAI_AIRPORTS, WORLD_AIRPORTS, airportByCode, airportLabel, cleanFlightNumber, findAirport, touchesThailand } from "@/lib/thai-flights";

type Point = { iata: string | null; airport: string | null; city: string | null; scheduled: string | null; revised: string | null; actual: string | null; terminal: string | null; gate: string | null; belt: string | null; lat: number | null; lon: number | null };
type Result = { flightNumber: string; date: string; status: string; airline: string | null; aircraft: string | null; departure: Point; arrival: Point; position: { lat: number; lon: number; track: number | null } | null; checkedAt: string };

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

/** Prefilled transfer booking for this flight: a pickup when landing in Thailand, else a ride to the airport. */
function transferLink(r: Result) {
  const time = (local: string | null) => local?.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  const arr = r.arrival.iata ? airportByCode(r.arrival.iata) : undefined;
  const dep = r.departure.iata ? airportByCode(r.departure.iata) : undefined;
  const q = new URLSearchParams({ rebook: "flight", flight: r.flightNumber });
  if (arr) {
    const m = time(r.arrival.revised ?? r.arrival.scheduled);
    if (m) { q.set("date", m[1]); q.set("time", `${m[2]}:${m[3]}`); }
    q.set("pickup", `${arr.name} (${arr.code})`);
    return { href: `/?${q}`, label: `Book a pickup at ${arr.city} airport` };
  }
  if (dep) {
    const m = time(r.departure.scheduled);
    if (m) {
      // Be at the airport about 3 hours before an international departure.
      const t = new Date(Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) - 3 * 3600_000);
      q.set("date", t.toISOString().slice(0, 10)); q.set("time", t.toISOString().slice(11, 16));
    }
    q.set("dropoff", `${dep.name} (${dep.code})`);
    return { href: `/?${q}`, label: `Book a ride to ${dep.city} airport` };
  }
  return null;
}

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

type RouteRow = { flightNumber: string; status: string; airline: string | null; from: string; to: string; time: string | null; revised: string | null; side: "departure" | "arrival"; terminal: string | null; gate: string | null };
// Built by hand (not Intl) so the server and the browser render exactly the same text: "Tue, Oct 6".
const niceDate = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return `${"Sun Mon Tue Wed Thu Fri Sat".split(" ")[t.getUTCDay()]}, ${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[t.getUTCMonth()]} ${t.getUTCDate()}`; };

export function FlightStatusSearch() {
  const [mode, setMode] = useState<"flight" | "route">("flight");
  const [flight, setFlight] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [route, setRoute] = useState<RouteRow[] | null>(null);

  async function ask(payload: object) {
    setBusy(true); setError(""); setResults([]); setRoute(null);
    try {
      const res = await fetch("/api/flights/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, date }) });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Flight status is unavailable right now.");
      else if (data.route) setRoute(data.route);
      else setResults(data.flights ?? []);
    } catch { setError("Flight status is unavailable right now."); }
    setBusy(false);
  }
  // Opened from "Most tracked flights" (/flights?flight=TG103&date=2026-10-06): search straight away.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const no = cleanFlightNumber(q.get("flight") ?? ""), d = q.get("date");
    if (!no) return;
    const t = window.setTimeout(() => {
      setFlight(no);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
      void fetch("/api/flights/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightNumber: no, date: d ?? today() }) })
        .then((r) => r.json().then((data) => (r.ok ? setResults(data.flights ?? []) : setError(data.error ?? "Flight status is unavailable right now.")))).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  function lookUp(no: string) { setMode("flight"); setFlight(no); void ask({ flightNumber: no }); }
  function search(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "flight") {
      const no = cleanFlightNumber(flight);
      if (!no) { setError("Enter a flight number, e.g. TG103 or FD3010."); return; }
      void ask({ flightNumber: no });
    } else {
      const f = findAirport(from), t = findAirport(to);
      if (!f || !t) { setError("Enter a city or airport for both, e.g. Bangkok and Singapore."); return; }
      setFrom(f); setTo(t);
      if (!touchesThailand(f, t)) { setError("One of the airports must be in Thailand."); return; }
      void ask({ from: f, to: t });
    }
  }

  const tab = (m: "flight" | "route", label: string) => <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(""); setResults([]); setRoute(null); }}
    className={`relative flex-1 py-4 text-[17px] transition ${mode === m ? "font-bold text-[#C96100] after:absolute after:bottom-0 after:left-1/2 after:h-[3px] after:w-10 after:-translate-x-1/2 after:rounded-full after:bg-[#FE8B05]" : "text-[#211726]"}`}>{label}</button>;
  const label = "block text-[14px] text-slate-500";
  const input = "wd-noarrow mt-1 w-full border-0 bg-transparent p-0 text-[20px] font-semibold text-[#211726] outline-none placeholder:font-semibold placeholder:text-slate-400";

  return <div>
    <form onSubmit={search} className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(33,23,38,.10)]">
      <div role="tablist" className="flex border-b border-slate-200">{tab("flight", "Flight no.")}{tab("route", "Route")}</div>
      <div className="px-5 pb-5 sm:px-6">
        {mode === "flight" ? <label className="block border-b border-slate-200 py-4">
          <span className={label}>Flight number</span>
          <input value={flight} onChange={(e) => setFlight(e.target.value)} placeholder="Please enter a flight number" autoCapitalize="characters" autoComplete="off" className={input} />
          <span className="mt-1 block text-[13px] text-slate-400">e.g. TG103</span>
        </label> : <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-200 py-4">
          <label className="min-w-0"><span className={label}>Departure</span><input value={from} onChange={(e) => setFrom(e.target.value)} list="wd-airports" placeholder="From" autoComplete="off" className={input} /><span className="mt-1 block truncate text-[14px] text-slate-500">{from && findAirport(from) ? airportLabel(findAirport(from)!) : "City or airport"}</span></label>
          <button type="button" aria-label="Swap departure and arrival" onClick={() => { setFrom(to); setTo(from); }} className="relative grid size-14 place-items-center rounded-full text-[#FE8B05]"><RefreshCw size={52} strokeWidth={1} className="absolute text-[#FE8B05]/40" /><Plane size={24} className="fill-[#FE8B05]" /></button>
          <label className="min-w-0 text-right"><span className={label}>Arrival</span><input value={to} onChange={(e) => setTo(e.target.value)} list="wd-airports" placeholder="To" autoComplete="off" className={`${input} text-right`} /><span className="mt-1 block truncate text-[14px] text-slate-500">{to && findAirport(to) ? airportLabel(findAirport(to)!) : "City or airport"}</span></label>
          <datalist id="wd-airports">{THAI_AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.city}</option>)}{WORLD_AIRPORTS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</datalist>
        </div>}
        <label className="relative block py-4">
          <span className={label}>Departure date (local time)</span>
          <span className="mt-1 flex items-center justify-between text-[20px] font-semibold text-[#211726]">{niceDate(date)}<CalendarDays size={26} className="text-[#211726]" /></span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Departure date" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <button type="submit" disabled={busy} className="h-[52px] w-full rounded-lg bg-[#FE8B05] text-[17px] font-semibold text-white transition hover:bg-[#E67900] disabled:opacity-60">{busy ? "Checking…" : "Check flight status"}</button>
        {error && <p role="alert" className="mt-3 text-[15px] text-red-600">{error}</p>}
        {mode === "route" && !error && <p className="mt-3 text-[13px] leading-5 text-slate-500">Flights to, from and within Thailand. Direct flights are listed; for a connection, check each flight by its number.</p>}
      </div>
    </form>

    {route && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-live="polite">
      <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-600">{route.length ? `${route.length} direct flight${route.length === 1 ? "" : "s"}` : "No direct flights found"} · {airportLabel(from)} → {airportLabel(to)} · {niceDate(date)}</p>
      <ul className="divide-y divide-slate-100">{route.map((r) => <li key={r.flightNumber + r.time}>
        <button type="button" onClick={() => lookUp(r.flightNumber)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-[#FFF6EC]">
          <span className="w-14 text-lg font-black">{hhmm(r.revised ?? r.time)}</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{r.flightNumber}</span><span className="block truncate text-sm text-slate-500">{r.airline ?? ""} · {r.side === "departure" ? "departs" : "arrives"}{r.terminal ? ` · T${r.terminal}` : ""}</span></span>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${status(r.status)[1]}`}>{status(r.status)[0]}</span>
        </button>
      </li>)}</ul>
    </div>}

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
      <FlightMap from={r.departure} to={r.arrival} position={r.position} />
      {r.position && <p className="mt-2 text-xs text-slate-500">Plane position from the last report.</p>}
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Local airport times. Updated {new Date(r.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} (Thailand time). Check with your airline for boarding and gate changes.</p>
      {transferLink(r) && <a href={transferLink(r)!.href} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-[#FE8B05] px-3 text-center font-semibold text-white hover:bg-[#E67900]">{transferLink(r)!.label}</a>}
    </div>)}
  </div>;
}

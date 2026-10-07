"use client";

import { CalendarDays, Plane, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FlightDetail, type FlightResult } from "@/components/flights/flight-detail";
import { THAI_AIRPORTS, WORLD_AIRPORTS, airportLabel, cleanFlightNumber, findAirport, touchesThailand } from "@/lib/thai-flights";

type Result = FlightResult;

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
  const closeDetail = useCallback(() => setResults([]), []);

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
    className={`relative flex-1 py-4 text-[17px] transition ${mode === m ? "font-bold text-brand-darker after:absolute after:bottom-0 after:left-1/2 after:h-[3px] after:w-10 after:-translate-x-1/2 after:rounded-full after:bg-brand" : "text-plum"}`}>{label}</button>;
  const label = "block text-[14px] text-slate-500";
  const input = "wd-noarrow mt-1 w-full border-0 bg-transparent p-0 text-[20px] font-semibold text-plum outline-none placeholder:font-semibold placeholder:text-slate-400";

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
          <button type="button" aria-label="Swap departure and arrival" onClick={() => { setFrom(to); setTo(from); }} className="relative grid size-14 place-items-center rounded-full text-brand"><RefreshCw size={52} strokeWidth={1} className="absolute text-brand/40" /><Plane size={24} className="fill-brand" /></button>
          <label className="min-w-0 text-right"><span className={label}>Arrival</span><input value={to} onChange={(e) => setTo(e.target.value)} list="wd-airports" placeholder="To" autoComplete="off" className={`${input} text-right`} /><span className="mt-1 block truncate text-[14px] text-slate-500">{to && findAirport(to) ? airportLabel(findAirport(to)!) : "City or airport"}</span></label>
          <datalist id="wd-airports">{THAI_AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.city}</option>)}{WORLD_AIRPORTS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</datalist>
        </div>}
        <label className="relative block py-4">
          <span className={label}>Departure date (local time)</span>
          <span className="mt-1 flex items-center justify-between text-[20px] font-semibold text-plum">{niceDate(date)}<CalendarDays size={26} className="text-plum" /></span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Departure date" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <button type="submit" disabled={busy} className="h-[52px] w-full rounded-lg bg-brand text-[17px] font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60">{busy ? "Checking…" : "Check flight status"}</button>
        {error && <p role="alert" className="mt-3 text-[15px] text-red-600">{error}</p>}
      </div>
    </form>

    {route && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-live="polite">
      <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-600">{route.length ? `${route.length} direct flight${route.length === 1 ? "" : "s"}` : "No direct flights found"} · {airportLabel(from)} → {airportLabel(to)} · {niceDate(date)}</p>
      <ul className="divide-y divide-slate-100">{route.map((r) => <li key={r.flightNumber + r.time}>
        <button type="button" onClick={() => lookUp(r.flightNumber)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-brand-wash">
          <span className="w-14 text-lg font-black">{hhmm(r.revised ?? r.time)}</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{r.flightNumber}</span><span className="block truncate text-sm text-slate-500">{r.airline ?? ""} · {r.side === "departure" ? "departs" : "arrives"}{r.terminal ? ` · T${r.terminal}` : ""}</span></span>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${status(r.status)[1]}`}>{status(r.status)[0]}</span>
        </button>
      </li>)}</ul>
    </div>}

    {results.length > 0 && <FlightDetail flights={results} onClose={closeDetail} />}
  </div>;
}

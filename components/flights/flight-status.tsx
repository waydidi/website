"use client";

import { Plane, Search } from "lucide-react";
import { useState } from "react";
import { THAI_AIRLINES, THAI_AIRPORTS, cleanFlightNumber } from "@/lib/thai-flights";

type Mode = "flight" | "airport" | "airline";
type Result = {
  flightNumber: string; flightDate: string; status: string; airline: string | null;
  departureAirport: string | null; arrivalAirport: string | null;
  scheduledArrival: string | null; estimatedArrival: string | null; actualArrival: string | null; terminal: string | null; checkedAt: string;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const clock = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(iso)) : "–");
const STATUS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700", active: "bg-sky-100 text-sky-800", landed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700", incident: "bg-red-100 text-red-700", diverted: "bg-amber-100 text-amber-800", delayed: "bg-amber-100 text-amber-800",
};
const statusLabel = (s: string) => (s === "active" ? "In the air" : s.charAt(0).toUpperCase() + s.slice(1));

export function FlightStatusSearch() {
  const [mode, setMode] = useState<Mode>("flight");
  const [flight, setFlight] = useState("");
  const [date, setDate] = useState(today);
  const [airport, setAirport] = useState("");
  const [airline, setAirline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setResult(null); setNotice("");
    if (mode === "flight") {
      const no = cleanFlightNumber(flight);
      if (!no) { setError("Enter a flight number, e.g. TG103 or FD3010."); return; }
      setBusy(true);
      try {
        const res = await fetch("/api/flights/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightNumber: no, flightDate: date }) });
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "Flight status is unavailable right now.");
        else setResult(data);
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
    <input type="radio" name="mode" checked={mode === m} onChange={() => { setMode(m); setError(""); setNotice(""); setResult(null); }} className="size-5 accent-[#FE8B05]" />{label}
  </label>;
  const field = "h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-[16px] text-[#211726] outline-none placeholder:text-slate-400 focus:border-[#FE8B05] focus:ring-2 focus:ring-[#FE8B05]/20";

  return <div>
    <form onSubmit={search} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap gap-x-7 gap-y-3" role="radiogroup" aria-label="Search by">{radio("flight", "Flight no.")}{radio("airport", "Airport")}{radio("airline", "Airline")}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        {mode === "flight" && <input value={flight} onChange={(e) => setFlight(e.target.value)} placeholder="Enter your flight number" aria-label="Flight number" autoCapitalize="characters" className={field} />}
        {mode === "airport" && <select value={airport} onChange={(e) => setAirport(e.target.value)} aria-label="Airport" className={field}><option value="">Choose a Thai airport</option>{THAI_AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.city} – {a.name} ({a.code})</option>)}</select>}
        {mode === "airline" && <select value={airline} onChange={(e) => setAirline(e.target.value)} aria-label="Airline" className={field}><option value="">Choose an airline</option>{THAI_AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}</select>}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={`${field} sm:w-[180px]`} />
      </div>
      <button type="submit" disabled={busy} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FE8B05] text-[18px] font-bold text-white transition hover:bg-[#E67900] disabled:opacity-60"><Search size={22} />{busy ? "Searching…" : "Search"}</button>
      {error && <p role="alert" className="mt-3 text-[15px] text-red-600">{error}</p>}
      {notice && <p role="status" className="mt-3 text-[15px] text-slate-600">{notice}</p>}
    </form>

    {result && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xl font-black">{result.flightNumber}</p><p className="text-slate-600">{result.airline ?? "Airline"} · {result.flightDate}</p></div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS[result.status] ?? STATUS.scheduled}`}>{statusLabel(result.status)}</span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <p className="font-bold">{result.departureAirport ?? "–"}</p><Plane className="text-[#FE8B05]" size={22} /><p className="text-right font-bold">{result.arrivalAirport ?? "–"}</p>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-sm">
        <div><dt className="text-slate-500">Scheduled arrival</dt><dd className="mt-1 text-base font-bold">{clock(result.scheduledArrival)}</dd></div>
        <div><dt className="text-slate-500">{result.actualArrival ? "Landed" : "Expected"}</dt><dd className="mt-1 text-base font-bold">{clock(result.actualArrival ?? result.estimatedArrival)}</dd></div>
        <div><dt className="text-slate-500">Terminal</dt><dd className="mt-1 text-base font-bold">{result.terminal ?? "–"}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Times in Thailand time. Checked {clock(result.checkedAt)}.</p>
      <a href="/airport-transfer" className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-[#FE8B05] font-bold text-[#C96100] hover:bg-[#FFF6EC]">Need a ride from the airport? Book a transfer</a>
    </div>}
  </div>;
}

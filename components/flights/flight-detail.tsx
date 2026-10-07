"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Info, Plane, PlaneLanding, PlaneTakeoff, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FlightMap } from "@/components/flights/flight-map";
import { airportByCode } from "@/lib/thai-flights";

export type FlightPoint = { iata: string | null; airport: string | null; city: string | null; scheduled: string | null; revised: string | null; actual: string | null; terminal: string | null; gate: string | null; belt: string | null; lat: number | null; lon: number | null; checkIn?: string | null };
export type FlightResult = { flightNumber: string; date: string; status: string; airline: string | null; aircraft: string | null; departure: FlightPoint; arrival: FlightPoint; position: { lat: number; lon: number; track: number | null } | null; checkedAt: string };

// Times come as the airport's local time: "2026-10-06 09:31+07:00".
const parts = (local: string | null) => local?.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/) ?? null;
const hhmm = (local: string | null) => { const m = parts(local); return m ? `${m[2]}:${m[3]}` : "–"; };
const minutes = (local: string | null) => { const m = parts(local); return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) / 60000 : null; };
const diff = (a: string | null, b: string | null) => { const x = minutes(a), y = minutes(b); return x === null || y === null ? null : Math.round(x - y); };
const niceDate = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return `${"Sun Mon Tue Wed Thu Fri Sat".split(" ")[t.getUTCDay()]}, ${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const place = (p: FlightPoint) => (p.iata ? airportByCode(p.iata)?.city : null) ?? p.city ?? p.iata ?? "";
const realGate = (g: string | null) => (g && !/^(ARR|DEP|N\/?A|-)$/i.test(g) ? g : null);
const early = (m: number) => (m < -1 ? `${-m} minutes early` : m > 1 ? `${m} minutes late` : "on time");

/** The coloured banner at the top of the card: what is happening now, in one sentence. */
function banner(r: FlightResult): { title: string; text: string; tone: string } {
  const s = r.status;
  const arrival = r.arrival.actual ?? r.arrival.revised;
  if (/Canceled/.test(s)) return { title: "Cancelled", text: "This flight has been cancelled. Please contact your airline.", tone: "bg-red-50 text-red-700" };
  if (s === "Diverted") return { title: "Diverted", text: "This flight has been diverted to another airport.", tone: "bg-amber-50 text-amber-800" };
  if (s === "Arrived" || s === "Landed") {
    const d = diff(arrival, r.arrival.scheduled);
    return { title: "Arrived", text: d === null ? "The flight has arrived." : d >= -1 && d <= 1 ? "The flight has arrived on time." : `The flight has arrived ${early(d)}.`, tone: "bg-[#EAF6F4] text-[#2F7A6B]" };
  }
  if (["EnRoute", "Departed", "Approaching"].includes(s)) {
    const d = diff(arrival, r.arrival.scheduled);
    return { title: s === "Approaching" ? "Landing soon" : "In the air", text: `Expected to land at ${hhmm(arrival ?? r.arrival.scheduled)}${d !== null && Math.abs(d) > 1 ? ` (${early(d)})` : ""}.`, tone: "bg-sky-50 text-sky-800" };
  }
  const dep = r.departure.revised ?? r.departure.scheduled;
  const late = diff(r.departure.revised, r.departure.scheduled);
  if (s === "Delayed" || (late !== null && late > 15)) return { title: "Delayed", text: `Now expected to depart at ${hhmm(dep)}${late && late > 0 ? ` (${late} minutes late)` : ""}.`, tone: "bg-amber-50 text-amber-800" };
  if (s === "Boarding") return { title: "Boarding", text: `Boarding now${realGate(r.departure.gate) ? ` at gate ${realGate(r.departure.gate)}` : ""}.`, tone: "bg-sky-50 text-sky-800" };
  if (s === "GateClosed") return { title: "Gate closed", text: "The gate has closed. Departing soon.", tone: "bg-sky-50 text-sky-800" };
  if (s === "CheckIn") return { title: "Check-in open", text: `Scheduled to depart at ${hhmm(dep)}.`, tone: "bg-slate-50 text-slate-700" };
  return { title: "Scheduled", text: `Scheduled to depart at ${hhmm(dep)}.`, tone: "bg-slate-50 text-slate-700" };
}

/** Prefilled transfer booking for this flight: a pickup when landing in Thailand, else a ride to the airport. */
function transfer(r: FlightResult) {
  const arr = r.arrival.iata ? airportByCode(r.arrival.iata) : undefined;
  const dep = r.departure.iata ? airportByCode(r.departure.iata) : undefined;
  const q = new URLSearchParams({ rebook: "flight", flight: r.flightNumber });
  if (arr) {
    const m = parts(r.arrival.revised ?? r.arrival.scheduled);
    if (m) { q.set("date", m[1]); q.set("time", `${m[2]}:${m[3]}`); }
    q.set("pickup", `${arr.name} (${arr.code})`);
    return { href: `/?${q}`, title: `Landing in ${arr.city}?`, text: "Your private driver meets you at arrivals and follows your flight, so a delay costs you nothing extra.", button: "Book your airport pickup" };
  }
  if (dep) {
    const m = parts(r.departure.scheduled);
    if (m) {
      // About 3 hours before an international departure.
      const t = new Date(Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) - 3 * 3600_000);
      q.set("date", t.toISOString().slice(0, 10)); q.set("time", t.toISOString().slice(11, 16));
    }
    q.set("dropoff", `${dep.name} (${dep.code})`);
    return { href: `/?${q}`, title: `Flying from ${dep.city}?`, text: "Get to the airport on time with a private driver, picked up from your hotel.", button: "Book a ride to the airport" };
  }
  return null;
}

// Open-Meteo weather codes → words and an icon.
function weatherLabel(code: number): [string, typeof Sun] {
  if (code === 0) return ["Clear sky", Sun];
  if (code <= 2) return ["Partly cloudy", CloudSun];
  if (code === 3) return ["Cloudy", Cloud];
  if (code <= 48) return ["Fog", CloudFog];
  if (code <= 57) return ["Drizzle", CloudDrizzle];
  if (code <= 61 || code === 80) return ["Light rain", CloudRain];
  if (code <= 67 || code <= 82) return ["Rain", CloudRain];
  if (code >= 95) return ["Thunderstorms", CloudLightning];
  return ["Showers", CloudRain];
}

/** Weather at the arrival airport: right now, and the forecast for the arrival day (Open-Meteo, free, no key). */
function Weather({ p }: { p: FlightPoint }) {
  const day = parts(p.revised ?? p.scheduled)?.[1];
  const [w, setW] = useState<{ now: { code: number; temp: number } | null; day: { code: number; min: number; max: number; rain: number | null } | null } | null>(null);
  useEffect(() => {
    if (p.lat === null || p.lon === null) return;
    const ctrl = new AbortController();
    // The forecast reaches 16 days ahead; outside that only the current weather is shown.
    const ahead = day ? (Date.parse(`${day}T00:00:00Z`) - Date.now()) / 86400_000 : null;
    const inRange = ahead !== null && ahead > -2 && ahead < 15;
    const range = inRange ? `&start_date=${day}&end_date=${day}` : "&forecast_days=1";
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto${range}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { current?: { temperature_2m?: number; weather_code?: number }; daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] } } | null) => {
        if (!d) return;
        const c = d.current, code = d.daily?.weather_code?.[0], max = d.daily?.temperature_2m_max?.[0], min = d.daily?.temperature_2m_min?.[0];
        setW({
          now: typeof c?.temperature_2m === "number" && typeof c.weather_code === "number" ? { code: c.weather_code, temp: Math.round(c.temperature_2m) } : null,
          day: inRange && typeof code === "number" && typeof max === "number" && typeof min === "number" ? { code, min: Math.round(min), max: Math.round(max), rain: d.daily?.precipitation_probability_max?.[0] ?? null } : null,
        });
      }).catch(() => undefined);
    return () => ctrl.abort();
  }, [p.lat, p.lon, day]);
  if (!w || (!w.now && !w.day)) return null;
  const row = (code: number, title: string, sub: string) => { const [text, Icon] = weatherLabel(code); return <div className="flex items-center gap-4 rounded-xl bg-[#F4F5F8] p-4">
    <Icon size={34} strokeWidth={1.6} className="shrink-0 text-plum" />
    <div className="min-w-0"><p className="text-[17px] font-semibold">{title.replace("{w}", text)}</p><p className="text-sm text-slate-500">{sub}</p></div>
  </div>; };
  return <section className="rounded-2xl bg-white p-5">
    <h2 className="text-[20px] font-semibold">You may want to know</h2>
    <div className="mt-4 grid gap-3">
      {w.now && row(w.now.code, `Now: {w} | ${w.now.temp} °C`, `Current weather in ${place(p)}`)}
      {w.day && row(w.day.code, `{w} | ${w.day.min} °C – ${w.day.max} °C`, `Weather forecast for ${place(p)} on your arrival date${w.day.rain !== null && w.day.rain >= 30 ? ` · ${w.day.rain}% chance of rain` : ""}`)}
    </div>
  </section>;
}

function Box({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return <div className="grid min-h-[110px] place-items-center rounded-xl border border-slate-200 bg-white px-2 py-3 text-center shadow-[0_2px_8px_rgba(33,23,38,.05)]">
    <p className="text-[15px] text-plum">{label}</p>
    <p className="text-[24px] font-semibold">{value ?? "–"}</p>
    {sub ? <p className="text-xs text-slate-500">{sub}</p> : <span />}
  </div>;
}

function Card({ r }: { r: FlightResult }) {
  const b = banner(r);
  const dep = r.departure, arr = r.arrival;
  const gate = realGate(dep.gate) ?? realGate(arr.gate);
  const boxes = [
    dep.checkIn ? <Box key="c" label="Check-in" value={dep.checkIn} /> : null,
    <Box key="g" label="Gate" value={gate} sub={dep.terminal ? `Terminal ${dep.terminal}` : undefined} />,
    <Box key="b" label="Baggage" value={arr.belt} sub={arr.terminal ? `Terminal ${arr.terminal}` : undefined} />,
  ].filter(Boolean);
  const link = transfer(r);
  const guide = [dep, arr].filter((p) => p.iata && airportByCode(p.iata));
  return <div className="grid gap-4">
    <section className="overflow-hidden rounded-2xl bg-white">
      <div className={`px-5 py-4 ${b.tone}`}><p className="text-[24px] font-semibold">{b.title}</p><p className="mt-1 text-[15px] text-plum/80">{b.text}</p></div>
      <div className="px-5 pb-5 pt-5">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <p className="text-[34px] font-semibold leading-none">{hhmm(dep.actual ?? dep.revised ?? dep.scheduled)}</p>
          <div className="relative mx-1 h-px bg-slate-300"><span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-slate-400" /><Plane size={20} className="absolute -right-1 -top-[10px] fill-slate-300 text-slate-300" /></div>
          <p className="text-right text-[34px] font-semibold leading-none">{hhmm(arr.actual ?? arr.revised ?? arr.scheduled)}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[15px] text-slate-600">
          <div><p>Scheduled: {hhmm(dep.scheduled)}</p><p className="mt-1">{dep.airport ?? dep.iata}</p></div>
          <div className="text-right"><p>Scheduled: {hhmm(arr.scheduled)}</p><p className="mt-1">{arr.airport ?? arr.iata}</p></div>
        </div>
        <div className={`mt-5 grid gap-3 ${boxes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{boxes}</div>
      </div>
    </section>
    <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-slate-500"><Info size={14} /> For reference only. Please check with your airline. Updated {new Date(r.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}.</p>

    {(dep.lat !== null && arr.lat !== null) && <section className="overflow-hidden rounded-2xl bg-white p-5 pt-1"><FlightMap from={dep} to={arr} position={r.position} /></section>}

    {link && <section className="rounded-2xl bg-white p-5 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-wash text-brand"><Plane size={26} className="fill-brand" /></span>
      <h2 className="mt-3 text-[22px] font-semibold">{link.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-slate-600">{link.text}</p>
      <a href={link.href} className="mt-5 flex h-[52px] items-center justify-center rounded-lg bg-brand text-[17px] font-semibold text-white hover:bg-brand-strong">{link.button}</a>
    </section>}

    <Weather p={arr} />

    {r.aircraft && <section className="rounded-2xl bg-white p-5">
      <h2 className="text-[20px] font-semibold">{r.aircraft}</h2>
      <p className="mt-1 text-sm text-slate-500">{r.airline ?? ""}{r.airline ? " · " : ""}Flight info for reference only</p>
    </section>}

    {guide.length > 0 && <section className="rounded-2xl bg-white p-5">
      <h2 className="text-[20px] font-semibold">Airport guide</h2>
      <p className="mt-1 text-[15px] text-slate-500">Meeting your driver, terminals and more</p>
      <ul className="mt-3 divide-y divide-slate-200">{guide.map((p) => { const Icon = p === dep ? PlaneTakeoff : PlaneLanding; return <li key={p.iata}>
        <Link href="/airport-pickup-instructions" className="flex items-center gap-4 py-4">
          <span className="grid size-11 place-items-center rounded-lg bg-[#F4F5F8]"><Icon size={22} className="text-plum" /></span>
          <span className="flex-1 text-[17px]">{p.airport ?? airportByCode(p.iata!)?.name}</span><ChevronRight size={20} className="text-slate-400" />
        </Link>
      </li>; })}</ul>
    </section>}
  </div>;
}

/** Full-screen results that slide in from the right, like Trip.com. The phone's back button closes it. */
const withCoords = (p: FlightPoint): FlightPoint => {
  const a = p.iata ? airportByCode(p.iata) : undefined;
  return p.lat === null && a ? { ...p, lat: a.lat, lon: a.lon } : p;
};

export function FlightDetail({ flights: raw, onClose }: { flights: FlightResult[]; onClose: () => void }) {
  const flights = raw.map((f) => ({ ...f, departure: withCoords(f.departure), arrival: withCoords(f.arrival) }));
  const [leg, setLeg] = useState(0);
  const [shown, setShown] = useState(false);
  const [legsOpen, setLegsOpen] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 10);
    window.history.pushState({ waydidiFlight: true }, "");
    const back = () => { setShown(false); window.setTimeout(onClose, 250); };
    window.addEventListener("popstate", back);
    document.documentElement.style.overflow = "hidden";
    return () => { window.clearTimeout(t); window.removeEventListener("popstate", back); document.documentElement.style.overflow = ""; };
  }, [onClose]);
  const r = flights[Math.min(leg, flights.length - 1)];
  return <div className={`fixed inset-0 z-[90] flex flex-col bg-[#EEF0F4] transition-transform duration-300 ease-out ${shown ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal="true" aria-label={`Flight ${r.flightNumber}`}>
    <header className="shrink-0 bg-[linear-gradient(180deg,#FE8B05,#FFA33D)] px-3 pb-3 pt-[calc(10px+env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex max-w-[720px] items-start gap-2">
        <button type="button" onClick={() => window.history.back()} aria-label="Back to search" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/15"><ChevronLeft size={30} strokeWidth={1.8} /></button>
        <div className="min-w-0 pt-0.5">
          <button type="button" onClick={() => flights.length > 1 && setLegsOpen((v) => !v)} className="flex max-w-full items-center gap-2 text-left text-[22px] font-semibold leading-tight">
            <span className="truncate">{place(r.departure)} – {place(r.arrival)}</span>{flights.length > 1 && <ChevronDown size={22} className={`shrink-0 transition ${legsOpen ? "rotate-180" : ""}`} />}
          </button>
          <p className="mt-1 text-[15px] font-medium underline underline-offset-2">{niceDate(r.date)} | {r.flightNumber}</p>
        </div>
      </div>
      {legsOpen && <ul className="mx-auto mt-3 max-w-[720px] overflow-hidden rounded-xl bg-white text-plum">{flights.map((f, i) => <li key={i}>
        <button type="button" onClick={() => { setLeg(i); setLegsOpen(false); }} className={`flex w-full justify-between px-4 py-3 text-left ${i === leg ? "font-semibold text-brand-darker" : ""}`}><span>{place(f.departure)} – {place(f.arrival)}</span><span>{hhmm(f.departure.scheduled)}</span></button>
      </li>)}</ul>}
    </header>
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-[720px] px-3 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 sm:px-4"><Card key={leg} r={r} /></div>
    </div>
  </div>;
}

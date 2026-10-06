import { env } from "cloudflare:workers";
import { touchesThailand } from "@/lib/thai-flights";

// Flight status from AeroDataBox (bought on API.market or RapidAPI). Results are cached in D1 and
// every call to the paid API is counted, with a daily cap so the bill can't run away.

export type FlightPoint = {
  iata: string | null; airport: string | null; city: string | null;
  scheduled: string | null; revised: string | null; actual: string | null;
  terminal: string | null; gate: string | null; belt: string | null;
};
export type FlightStatus = {
  flightNumber: string; date: string; status: string; airline: string | null; airlineIata: string | null;
  aircraft: string | null; departure: FlightPoint; arrival: FlightPoint; checkedAt: string;
};

const DAILY_CAP = 300;
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const vars = () => env as unknown as Record<string, string | undefined>;
export const flightApiConfigured = () => Boolean(vars().AERODATABOX_KEY);

/** API.market by default; set AERODATABOX_PROVIDER=rapidapi for a RapidAPI key. */
function endpoint(path: string): { url: string; headers: Record<string, string> } {
  const key = vars().AERODATABOX_KEY!;
  const rapid = (vars().AERODATABOX_PROVIDER ?? "").toLowerCase() === "rapidapi";
  return rapid
    ? { url: `https://aerodatabox.p.rapidapi.com${path}`, headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" } }
    : { url: `https://prod.api.market/api/v1/aedbx/aerodatabox${path}`, headers: { "x-magicapi-key": key } };
}

/** Claims one call from today's budget; false when the cap is reached. */
async function claimCall() {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db().prepare("INSERT INTO flight_api_usage(day,calls) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 WHERE calls<? RETURNING calls").bind(day, DAILY_CAP).first<{ calls: number }>();
  return Boolean(row);
}

type Raw = {
  number?: string; status?: string; airline?: { name?: string; iata?: string }; aircraft?: { model?: string };
  departure?: RawPoint; arrival?: RawPoint;
};
type RawPoint = {
  airport?: { iata?: string; name?: string; municipalityName?: string };
  scheduledTime?: { local?: string }; revisedTime?: { local?: string }; runwayTime?: { local?: string };
  terminal?: string; gate?: string; baggageBelt?: string;
};
const point = (p?: RawPoint): FlightPoint => ({
  iata: p?.airport?.iata ?? null, airport: p?.airport?.name ?? null, city: p?.airport?.municipalityName ?? null,
  scheduled: p?.scheduledTime?.local ?? null, revised: p?.revisedTime?.local ?? null, actual: p?.runwayTime?.local ?? null,
  terminal: p?.terminal ?? null, gate: p?.gate ?? null, belt: p?.baggageBelt ?? null,
});

/** How long a result stays fresh: finished flights for hours, flights about to move for minutes. */
function ttl(status: string) {
  if (["Arrived", "Landed", "Canceled", "CanceledUncertain", "Diverted"].includes(status)) return 6 * 3600_000;
  if (["EnRoute", "Departed", "Boarding", "GateClosed", "Approaching", "Delayed"].includes(status)) return 3 * 60_000;
  return 15 * 60_000;
}

export async function flightStatus(flightNumber: string, date: string): Promise<FlightStatus[]> {
  const key = `${date}:${flightNumber}`;
  const cached = await db().prepare("SELECT result_json FROM flight_lookups WHERE cache_key=? AND expires_at>?").bind(key, new Date().toISOString()).first<{ result_json: string }>();
  if (cached) {
    const r = JSON.parse(cached.result_json) as FlightStatus[] | { error: string };
    if ("error" in r) throw new Error(r.error);
    return r;
  }
  if (!flightApiConfigured()) throw new Error("FLIGHT_API_NOT_CONFIGURED");
  if (!await claimCall()) throw new Error("FLIGHT_API_LIMIT");
  const { url, headers } = endpoint(`/flights/number/${encodeURIComponent(flightNumber)}/${date}?withAircraftImage=false&withLocation=false`);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  const now = new Date().toISOString();
  const save = (value: unknown, ms: number) => db().prepare("INSERT INTO flight_lookups(cache_key,result_json,fetched_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at")
    .bind(key, JSON.stringify(value), now, new Date(Date.now() + ms).toISOString()).run();
  if (res.status === 204 || res.status === 404) { await save({ error: "FLIGHT_NOT_FOUND" }, 30 * 60_000); throw new Error("FLIGHT_NOT_FOUND"); }
  if (res.status === 429) throw new Error("FLIGHT_API_LIMIT");
  if (!res.ok) { console.error("aerodatabox", res.status); throw new Error("FLIGHT_API_UNAVAILABLE"); }
  const raw = (await res.json().catch(() => [])) as Raw[];
  const flights = (Array.isArray(raw) ? raw : []).map((f) => ({
    flightNumber: (f.number ?? flightNumber).replace(/\s+/g, ""), date, status: f.status ?? "Unknown",
    airline: f.airline?.name ?? null, airlineIata: f.airline?.iata ?? null, aircraft: f.aircraft?.model ?? null,
    departure: point(f.departure), arrival: point(f.arrival), checkedAt: now,
  }));
  // Thailand only. A flight number with a stop (e.g. LHR → DXB → BKK) is shown with all its legs when any leg
  // starts or ends in Thailand; flights that never touch Thailand aren't shown (and are remembered as such).
  const thai = flights.some((f) => touchesThailand(f.departure.iata, f.arrival.iata)) ? flights : [];
  if (!flights.length) { await save({ error: "FLIGHT_NOT_FOUND" }, 30 * 60_000); throw new Error("FLIGHT_NOT_FOUND"); }
  if (!thai.length) { await save({ error: "NOT_THAILAND" }, 24 * 3600_000); throw new Error("NOT_THAILAND"); }
  await save(thai, Math.min(...thai.map((f) => ttl(f.status))));
  return thai;
}

export type RouteFlight = {
  flightNumber: string; status: string; airline: string | null; from: string; to: string;
  /** Time at the airport we looked at: departure time when searching from a Thai airport, else arrival time. */
  time: string | null; revised: string | null; side: "departure" | "arrival"; terminal: string | null; gate: string | null;
};
type FidsItem = { number?: string; status?: string; airline?: { name?: string }; codeshareStatus?: string; movement?: RawPoint };

/** One airport's departures or arrivals for a day (two 12-hour calls; cached 15 minutes and shared by every route search). */
export async function airportBoard(iata: string, direction: "Departure" | "Arrival", date: string) {
  const key = `board:${iata}:${direction}:${date}`;
  const cached = await db().prepare("SELECT result_json FROM flight_lookups WHERE cache_key=? AND expires_at>?").bind(key, new Date().toISOString()).first<{ result_json: string }>();
  if (cached) return JSON.parse(cached.result_json) as FidsItem[];
  if (!flightApiConfigured()) throw new Error("FLIGHT_API_NOT_CONFIGURED");
  const items: FidsItem[] = [];
  for (const [from, to] of [["00:00", "11:59"], ["12:00", "23:59"]]) {
    if (!await claimCall()) throw new Error("FLIGHT_API_LIMIT");
    const { url, headers } = endpoint(`/flights/airports/iata/${iata}/${date}T${from}/${date}T${to}?direction=${direction}&withLeg=false&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false`);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429) throw new Error("FLIGHT_API_LIMIT");
    if (res.status === 204) continue;
    if (!res.ok) { console.error("aerodatabox board", res.status); throw new Error(res.status === 400 || res.status === 404 ? "AIRPORT_NOT_FOUND" : "FLIGHT_API_UNAVAILABLE"); }
    const body = await res.json().catch(() => ({})) as { departures?: FidsItem[]; arrivals?: FidsItem[] };
    items.push(...(direction === "Departure" ? body.departures : body.arrivals) ?? []);
  }
  const now = new Date().toISOString();
  await db().prepare("INSERT INTO flight_lookups(cache_key,result_json,fetched_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at")
    .bind(key, JSON.stringify(items), now, new Date(Date.now() + 15 * 60_000).toISOString()).run();
  return items;
}

/** Direct flights on a route; one end must be a Thai airport. */
export async function routeFlights(from: string, to: string, date: string): Promise<RouteFlight[]> {
  if (!touchesThailand(from, to)) throw new Error("NOT_THAILAND");
  // Read the Thai airport's board: its departures when leaving Thailand (or flying domestic), else its arrivals.
  const fromThai = touchesThailand(from, null);
  const board = await airportBoard(fromThai ? from : to, fromThai ? "Departure" : "Arrival", date);
  const other = fromThai ? to : from;
  return board.filter((f) => f.movement?.airport?.iata === other).map((f) => ({
    flightNumber: (f.number ?? "").replace(/\s+/g, ""), status: f.status ?? "Unknown", airline: f.airline?.name ?? null, from, to,
    time: f.movement?.scheduledTime?.local ?? null, revised: f.movement?.revisedTime?.local ?? null, side: fromThai ? "departure" as const : "arrival" as const,
    terminal: f.movement?.terminal ?? null, gate: f.movement?.gate ?? null,
  })).filter((f, i, all) => all.findIndex((g) => g.flightNumber === f.flightNumber && g.time === f.time) === i)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
}

// ---- Daily stats: yesterday's departures from Thailand's busiest airports (10 calls a day) ----

export const STATS_AIRPORTS = ["BKK", "DMK", "HKT", "CNX", "HDY"];
export type FlightStats = {
  day: string;
  airports: { iata: string; flights: number; onTime: number | null }[];
  airlines: { name: string; flights: number; onTime: number | null }[];
  routes: { from: string; to: string; flights: number; topAirline: string | null }[];
};
const minutes = (local?: string) => { const m = local?.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/); return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) / 60000 : null; };
/** Left within 15 minutes of schedule; null when there's no actual or revised time yet. */
function onTime(f: FidsItem) {
  const s = minutes(f.movement?.scheduledTime?.local), a = minutes(f.movement?.runwayTime?.local ?? f.movement?.revisedTime?.local);
  return s === null || a === null ? null : a - s <= 15;
}
const pct = (ok: number, of: number) => (of ? Math.round((ok / of) * 100) : null);

export function buildStats(day: string, boards: Record<string, FidsItem[]>): FlightStats {
  const airlines = new Map<string, { flights: number; ok: number; known: number }>();
  const routes = new Map<string, { flights: number; airlines: Map<string, number> }>();
  const airports = STATS_AIRPORTS.map((iata) => {
    const list = (boards[iata] ?? []).filter((f) => !/Canceled/.test(f.status ?? ""));
    let ok = 0, known = 0;
    for (const f of list) {
      const t = onTime(f);
      if (t !== null) { known++; if (t) ok++; }
      const name = f.airline?.name ?? "Other";
      const a = airlines.get(name) ?? { flights: 0, ok: 0, known: 0 };
      a.flights++; if (t !== null) { a.known++; if (t) a.ok++; } airlines.set(name, a);
      const to = f.movement?.airport?.iata;
      if (to) { const k = `${iata}-${to}`; const r = routes.get(k) ?? { flights: 0, airlines: new Map() }; r.flights++; r.airlines.set(name, (r.airlines.get(name) ?? 0) + 1); routes.set(k, r); }
    }
    return { iata, flights: list.length, onTime: pct(ok, known) };
  }).sort((a, b) => b.flights - a.flights);
  return {
    day, airports,
    airlines: [...airlines].filter(([n]) => n !== "Other").map(([name, a]) => ({ name, flights: a.flights, onTime: pct(a.ok, a.known) })).sort((a, b) => b.flights - a.flights).slice(0, 8),
    routes: [...routes].map(([k, r]) => ({ from: k.slice(0, 3), to: k.slice(4), flights: r.flights, topAirline: [...r.airlines].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })).sort((a, b) => b.flights - a.flights).slice(0, 8),
  };
}

/** Run from the every-minute cron: once a day after 02:00 Thailand time, builds yesterday's stats. */
export async function dailyStatsIfDue(at: Date) {
  if (!flightApiConfigured()) return;
  const bkk = new Date(at.getTime() + 7 * 3600_000);
  if (bkk.getUTCHours() < 2) return;
  const day = new Date(bkk.getTime() - 86400_000).toISOString().slice(0, 10);
  // Claim the day (one run only); a failed run may retry after an hour.
  const claimed = await db().prepare("INSERT INTO flight_stats(day,status,created_at) VALUES(?,'pending',?) ON CONFLICT(day) DO UPDATE SET status='pending',created_at=excluded.created_at WHERE flight_stats.status='failed' AND flight_stats.created_at<? RETURNING day")
    .bind(day, at.toISOString(), new Date(at.getTime() - 3600_000).toISOString()).first<{ day: string }>();
  if (!claimed) return;
  try {
    const boards: Record<string, FidsItem[]> = {};
    for (const iata of STATS_AIRPORTS) boards[iata] = await airportBoard(iata, "Departure", day);
    await db().prepare("UPDATE flight_stats SET stats_json=?,status='done' WHERE day=?").bind(JSON.stringify(buildStats(day, boards)), day).run();
  } catch (e) {
    console.error("flight stats failed", e instanceof Error ? e.message : "unknown");
    await db().prepare("UPDATE flight_stats SET status='failed' WHERE day=?").bind(day).run();
  }
}

export async function latestStats() {
  const row = await db().prepare("SELECT stats_json FROM flight_stats WHERE status='done' ORDER BY day DESC LIMIT 1").first<{ stats_json: string }>().catch(() => null);
  return row ? JSON.parse(row.stats_json) as FlightStats : null;
}

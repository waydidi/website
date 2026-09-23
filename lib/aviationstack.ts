import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { flightStatusCache } from "@/db/schema";

export type FlightSnapshot = {
  flightNumber: string; flightDate: string; status: string; airline: string | null;
  departureAirport: string | null; arrivalAirport: string | null;
  scheduledArrival: string | null; estimatedArrival: string | null;
  actualArrival: string | null; terminal: string | null; checkedAt: string; cached: boolean;
};

type AviationstackFlight = {
  flight_date?: string; flight_status?: string;
  airline?: { name?: string };
  departure?: { airport?: string; iata?: string };
  arrival?: { airport?: string; iata?: string; scheduled?: string; estimated?: string; actual?: string; terminal?: string };
};

function normaliseFlightNumber(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function ttlFor(status: string) {
  return ["landed", "cancelled", "diverted"].includes(status) ? 6 * 60 * 60_000 : 30 * 60_000;
}

export async function lookupFlight(rawFlightNumber: string, flightDate: string, force = false): Promise<FlightSnapshot> {
  const flightNumber = normaliseFlightNumber(rawFlightNumber);
  if (!/^[A-Z0-9]{3,8}$/.test(flightNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) throw new Error("INVALID_FLIGHT");
  const cacheKey = `${flightDate}:${flightNumber}`;
  const [cached] = await getDb().select().from(flightStatusCache).where(eq(flightStatusCache.cacheKey, cacheKey)).limit(1);
  if (!force && cached && Date.parse(cached.expiresAt) > Date.now()) return {
    flightNumber, flightDate, status: cached.status, airline: cached.airline,
    departureAirport: cached.departureAirport, arrivalAirport: cached.arrivalAirport,
    scheduledArrival: cached.scheduledArrival, estimatedArrival: cached.estimatedArrival,
    actualArrival: cached.actualArrival, terminal: cached.terminal, checkedAt: cached.fetchedAt, cached: true,
  };
  if (!env.AVIATIONSTACK_API_KEY) throw new Error("FLIGHT_API_NOT_CONFIGURED");
  const url = new URL("https://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", env.AVIATIONSTACK_API_KEY);
  url.searchParams.set("flight_iata", flightNumber);
  url.searchParams.set("flight_date", flightDate);
  url.searchParams.set("limit", "5");
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(response.status === 429 ? "FLIGHT_API_LIMIT" : "FLIGHT_API_UNAVAILABLE");
  const payload = await response.json() as { error?: unknown; data?: AviationstackFlight[] };
  if (payload.error) throw new Error("FLIGHT_API_UNAVAILABLE");
  const item = payload.data?.find((row) => row.flight_date === flightDate) ?? payload.data?.[0];
  if (!item) throw new Error("FLIGHT_NOT_FOUND");
  const status = String(item.flight_status ?? "scheduled").toLowerCase();
  const fetchedAt = new Date().toISOString();
  const row = {
    cacheKey, flightNumber, flightDate, status,
    airline: item.airline?.name ?? null,
    departureAirport: item.departure?.airport ?? item.departure?.iata ?? null,
    arrivalAirport: item.arrival?.airport ?? item.arrival?.iata ?? null,
    scheduledArrival: item.arrival?.scheduled ?? null,
    estimatedArrival: item.arrival?.estimated ?? null,
    actualArrival: item.arrival?.actual ?? null,
    terminal: item.arrival?.terminal ?? null,
    fetchedAt, expiresAt: new Date(Date.now() + ttlFor(status)).toISOString(),
  };
  await getDb().insert(flightStatusCache).values(row).onConflictDoUpdate({ target: flightStatusCache.cacheKey, set: row });
  return { ...row, checkedAt: fetchedAt, cached: false };
}

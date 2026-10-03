import { env } from "cloudflare:workers";
import { estimateDriveMinutes, type Point } from "@/lib/trip-plan";

const key = (p: Point) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

type MatrixRow = { originIndex?: number; destinationIndex?: number; duration?: string; condition?: string };

/**
 * Drive minutes between every pair of points, from Google's route matrix with
 * traffic for the trip's departure time when possible. Falls back to a
 * distance estimate per pair, so planning never fails because of Maps.
 * Returns the lookup function the planning engine expects, and where times came from.
 */
export async function travelMatrix(points: Point[], departure: Date | null): Promise<{ travel: (a: Point, b: Point) => number; source: "google" | "estimate" }> {
  const unique = [...new Map(points.map((p) => [key(p), p])).values()];
  const minutes = new Map<string, number>();
  const estimate = (a: Point, b: Point) => estimateDriveMinutes(a, b);
  const travel = (a: Point, b: Point) => (key(a) === key(b) ? 0 : minutes.get(`${key(a)}>${key(b)}`) ?? estimate(a, b));
  const apiKey = (env as unknown as Record<string, string | undefined>).GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey || unique.length < 2 || unique.length > 25) return { travel, source: "estimate" };

  const future = departure && departure.getTime() > Date.now() + 60_000 ? departure : null;
  const hourKey = future ? new Date(Math.floor(future.getTime() / 3_600_000) * 3_600_000).toISOString() : "now";
  const cacheKey = new Request(`https://trip-matrix.waydidi.internal/${encodeURIComponent(unique.map(key).sort().join("|"))}/${hourKey}`);
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  let rows: { a: string; b: string; min: number }[] | null = null;
  const cached = await cache?.match(cacheKey).catch(() => undefined);
  if (cached) rows = await cached.json().catch(() => null) as typeof rows;

  if (!rows) {
    const waypoint = (p: Point) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
    const elements = unique.length * unique.length;
    const body: Record<string, unknown> = {
      origins: unique.map(waypoint), destinations: unique.map(waypoint), travelMode: "DRIVE",
      // Traffic-aware matrices are limited to 100 elements.
      routingPreference: elements <= 100 ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
      ...(future ? { departureTime: future.toISOString() } : {}),
    };
    const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!response?.ok) return { travel, source: "estimate" };
    const data = await response.json().catch(() => null) as MatrixRow[] | null;
    if (!Array.isArray(data)) return { travel, source: "estimate" };
    rows = data.filter((r) => r.condition === "ROUTE_EXISTS" && r.duration && r.originIndex != null && r.destinationIndex != null)
      .map((r) => ({ a: key(unique[r.originIndex!]), b: key(unique[r.destinationIndex!]), min: Math.round(Number.parseInt(r.duration!, 10) / 60) }));
    await cache?.put(cacheKey, new Response(JSON.stringify(rows), { headers: { "Cache-Control": "max-age=43200" } })).catch(() => undefined);
  }
  for (const r of rows) minutes.set(`${r.a}>${r.b}`, r.min);
  return { travel, source: rows.length ? "google" : "estimate" };
}

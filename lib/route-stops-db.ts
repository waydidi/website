import { env } from "cloudflare:workers";
import type { RouteStopOffer, RouteStopSnapshot } from "./route-stops";

export type { RouteStopOffer, RouteStopSnapshot } from "./route-stops";
export type RouteStopInput = Omit<RouteStopOffer, "name" | "photo">;
export class RouteStopValidationError extends Error {}

const TABLE = `CREATE TABLE IF NOT EXISTS route_stop_offers (
  id TEXT PRIMARY KEY, attraction_id TEXT NOT NULL REFERENCES attractions(id),
  origin_zone_json TEXT NOT NULL, destination_zone_json TEXT NOT NULL,
  bidirectional INTEGER NOT NULL DEFAULT 1 CHECK(bidirectional IN (0,1)),
  price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor BETWEEN 0 AND 100000000),
  duration_minutes INTEGER NOT NULL CHECK(typeof(duration_minutes)='integer' AND duration_minutes BETWEEN 1 AND 480),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  sort INTEGER NOT NULL DEFAULT 0 CHECK(typeof(sort)='integer' AND sort BETWEEN 0 AND 1000000)
)`;
const INDEX = "CREATE INDEX IF NOT EXISTS route_stop_offers_active_sort ON route_stop_offers(active,sort,id)";
const box = (south: number, north: number, west: number, east: number) => JSON.stringify([[
  { lat: south, lng: west }, { lat: south, lng: east }, { lat: north, lng: east }, { lat: north, lng: west },
]]);

export async function ensureRouteStops(): Promise<void> {
  await env.DB.batch([env.DB.prepare(TABLE), env.DB.prepare(INDEX)]);
  // Suggestions only: attach to real library records, never publish or create places.
  // INSERT OR IGNORE preserves staff edits, including deactivation, across cold starts.
  const origin = box(13.45, 14.05, 100.25, 100.97);
  const destination = box(12.45, 12.7, 99.85, 100.05); // Hua Hin
  await env.DB.batch([
    ["draft-maeklong-hua-hin", "bkk-maeklong-railway", 60000, 60, 10],
    ["draft-damnoen-hua-hin", "bkk-damnoen-saduak", 90000, 90, 20],
  ].map(([id, key, price, duration, sort]) => env.DB.prepare(`INSERT OR IGNORE INTO route_stop_offers
    (id,attraction_id,origin_zone_json,destination_zone_json,bidirectional,price_minor,duration_minutes,active,sort)
    SELECT ?,id,?,?,1,?,?,0,? FROM attractions WHERE seed_key=?`)
    .bind(id, origin, destination, price, duration, sort, key)));
}

function invalid(message: string): never { throw new RouteStopValidationError(message); }
function zone(value: unknown): string {
  if (typeof value !== "string" || value.length > 100000) return invalid("Use polygon JSON for both route zones.");
  let polygons: unknown;
  try { polygons = JSON.parse(value); } catch { return invalid("Route zone JSON is invalid."); }
  if (!Array.isArray(polygons) || polygons.length < 1 || polygons.length > 20) return invalid("A zone needs 1–20 polygons.");
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 500) return invalid("Each polygon needs 3–500 coordinates.");
    for (const point of polygon) {
      if (!point || typeof point !== "object" || typeof point.lat !== "number" || typeof point.lng !== "number" ||
        !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
        return invalid("Polygon coordinates must be finite latitude/longitude values.");
      }
    }
    const distinct = new Set(polygon.map(p => `${p.lat},${p.lng}`));
    const area = polygon.reduce((sum, p, i) => { const next = polygon[(i + 1) % polygon.length]; return sum + p.lng * next.lat - next.lng * p.lat; }, 0);
    if (distinct.size < 3 || Math.abs(area) < 1e-10) return invalid("A polygon must enclose an area.");
  }
  return JSON.stringify(polygons);
}

export function parseRouteStopOffer(value: unknown): RouteStopInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Offer details are required.");
  const v = value as Record<string, unknown>;
  for (const key of ["id", "attractionId"] as const) {
    if (typeof v[key] !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(v[key])) return invalid("Use a valid offer and attraction ID.");
  }
  if (typeof v.active !== "boolean" || typeof v.bidirectional !== "boolean") return invalid("Active and bidirectional must be true or false.");
  for (const [key, min, max] of [["priceMinor", 0, 100000000], ["durationMinutes", 1, 480], ["sort", 0, 1000000]] as const) {
    if (typeof v[key] !== "number" || !Number.isSafeInteger(v[key]) || v[key] < min || v[key] > max) return invalid(`${key} must be an integer from ${min} to ${max}.`);
  }
  return {
    id: v.id as string, attractionId: v.attractionId as string,
    originZoneJson: zone(v.originZoneJson), destinationZoneJson: zone(v.destinationZoneJson),
    bidirectional: v.bidirectional, active: v.active,
    priceMinor: v.priceMinor as number, durationMinutes: v.durationMinutes as number, sort: v.sort as number,
  };
}

export async function listRouteStopOffers(): Promise<RouteStopOffer[]> {
  await ensureRouteStops();
  const { results } = await env.DB.prepare(`SELECT o.id,o.attraction_id AS attractionId,
    COALESCE(NULLIF(a.customer_name,''),a.name) AS name,a.cover_image AS photo,
    o.origin_zone_json AS originZoneJson,o.destination_zone_json AS destinationZoneJson,
    o.bidirectional,o.price_minor AS priceMinor,o.duration_minutes AS durationMinutes,
    CASE WHEN a.status='active' THEN o.active ELSE 0 END AS active,o.sort
    FROM route_stop_offers o JOIN attractions a ON a.id=o.attraction_id ORDER BY o.sort,o.id`)
    .all<Omit<RouteStopOffer, "active" | "bidirectional"> & { active: number; bidirectional: number }>();
  return results.map(row => ({ ...row, active: row.active === 1, bidirectional: row.bidirectional === 1 }));
}

export async function listRouteStopAttractions(): Promise<{ id: string; name: string }[]> {
  const { results } = await env.DB.prepare("SELECT id,name FROM attractions WHERE status='active' ORDER BY name,id").all<{ id: string; name: string }>();
  return results;
}

export async function saveRouteStopOffer(value: unknown): Promise<string> {
  const offer = parseRouteStopOffer(value);
  await ensureRouteStops();
  const attraction = await env.DB.prepare("SELECT id FROM attractions WHERE id=? AND status='active'").bind(offer.attractionId).first();
  if (!attraction) return invalid("Choose an active attraction from the library.");
  await env.DB.prepare(`INSERT INTO route_stop_offers
    (id,attraction_id,origin_zone_json,destination_zone_json,bidirectional,price_minor,duration_minutes,active,sort)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    attraction_id=excluded.attraction_id,origin_zone_json=excluded.origin_zone_json,
    destination_zone_json=excluded.destination_zone_json,bidirectional=excluded.bidirectional,
    price_minor=excluded.price_minor,duration_minutes=excluded.duration_minutes,active=excluded.active,sort=excluded.sort`)
    .bind(offer.id, offer.attractionId, offer.originZoneJson, offer.destinationZoneJson, Number(offer.bidirectional), offer.priceMinor, offer.durationMinutes, Number(offer.active), offer.sort).run();
  return offer.id;
}

export async function priceRouteStops(ids: string[], quote: {
  pickupLatitude: number | null; pickupLongitude: number | null;
  dropoffLatitude: number | null; dropoffLongitude: number | null;
}, enabled: boolean): Promise<RouteStopSnapshot[]> {
  const { selectRouteStops } = await import("./route-stops");
  const pickup = quote.pickupLatitude === null || quote.pickupLongitude === null ? null : { lat: quote.pickupLatitude, lng: quote.pickupLongitude };
  const dropoff = quote.dropoffLatitude === null || quote.dropoffLongitude === null ? null : { lat: quote.dropoffLatitude, lng: quote.dropoffLongitude };
  return selectRouteStops(ids, enabled ? await listRouteStopOffers() : [], pickup, dropoff, enabled);
}

import { pointInPolygon, type Point } from "./geo";

export type RouteStopOffer = {
  id: string; attractionId: string; name: string; photo: string | null;
  originZoneJson: string; destinationZoneJson: string;
  bidirectional: boolean; active: boolean; priceMinor: number; durationMinutes: number; sort: number;
};
export type RouteStopSnapshot = {
  offerId: string; attractionId: string; name: string; durationMinutes: number; priceMinor: number;
};
export class RouteStopSelectionError extends Error {}

/** A booking snapshot is contractual data, never reconstructed from live offers. */
export function parseRouteStopSnapshots(json: string | null | undefined): RouteStopSnapshot[] {
  if (json == null || json === "") return [];
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new RouteStopSelectionError("INVALID_ROUTE_STOP_SNAPSHOT"); }
  if (!Array.isArray(value) || value.length > 3) throw new RouteStopSelectionError("INVALID_ROUTE_STOP_SNAPSHOT");
  const ids = new Set<string>();
  return value.map((v: unknown) => {
    if (!v || typeof v !== "object") throw new RouteStopSelectionError("INVALID_ROUTE_STOP_SNAPSHOT");
    const s = v as RouteStopSnapshot;
    if (typeof s.offerId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(s.offerId) || ids.has(s.offerId) ||
      typeof s.attractionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(s.attractionId) ||
      typeof s.name !== "string" || !s.name.trim() || s.name.length > 500 ||
      !Number.isSafeInteger(s.priceMinor) || s.priceMinor < 0 || s.priceMinor > 100000000 ||
      !Number.isSafeInteger(s.durationMinutes) || s.durationMinutes < 1 || s.durationMinutes > 480) {
      throw new RouteStopSelectionError("INVALID_ROUTE_STOP_SNAPSHOT");
    }
    ids.add(s.offerId);
    return { offerId: s.offerId, attractionId: s.attractionId, name: s.name, durationMinutes: s.durationMinutes, priceMinor: s.priceMinor };
  });
}
export function stopTotalMinor(stops: RouteStopSnapshot[]): number { return stops.reduce((sum, stop) => sum + stop.priceMinor, 0); }
export function stopDurationMinutes(stops: RouteStopSnapshot[]): number { return stops.reduce((sum, stop) => sum + stop.durationMinutes, 0); }
const validPoint = (p: Point | null): p is Point => Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
function inZone(point: Point, json: string): boolean {
  try {
    const polygons: unknown = JSON.parse(json);
    return Array.isArray(polygons) && polygons.some(p => Array.isArray(p) && p.length >= 3 && p.every(validPoint) && pointInPolygon(point, p));
  } catch { return false; }
}
export function eligibleRouteStopOffers(offers: RouteStopOffer[], pickup: Point | null, dropoff: Point | null): RouteStopOffer[] {
  if (!validPoint(pickup) || !validPoint(dropoff)) return [];
  return offers.filter(o => o.active && Number.isSafeInteger(o.priceMinor) && o.priceMinor >= 0 && o.priceMinor <= 100000000 &&
    Number.isSafeInteger(o.durationMinutes) && o.durationMinutes >= 1 && o.durationMinutes <= 480 &&
    ((inZone(pickup,o.originZoneJson) && inZone(dropoff,o.destinationZoneJson)) ||
    (o.bidirectional && inZone(dropoff,o.originZoneJson) && inZone(pickup,o.destinationZoneJson))));
}
export function selectRouteStops(enabled: boolean, ids: string[], offers: RouteStopOffer[], pickup: Point | null, dropoff: Point | null): RouteStopSnapshot[] {
  if (!ids.length) return [];
  if (!enabled) throw new RouteStopSelectionError("ROUTE_STOPS_DISABLED");
  if (ids.length > 3 || new Set(ids).size !== ids.length) throw new RouteStopSelectionError("INVALID_ROUTE_STOPS");
  const eligible = new Map(eligibleRouteStopOffers(offers,pickup,dropoff).map(o => [o.id,o]));
  return ids.map(id => {
    const offer = eligible.get(id);
    if (!offer) throw new RouteStopSelectionError("ROUTE_STOP_UNAVAILABLE");
    return { offerId: offer.id, attractionId: offer.attractionId, name: offer.name, durationMinutes: offer.durationMinutes, priceMinor: offer.priceMinor };
  });
}

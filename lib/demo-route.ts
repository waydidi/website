// Prototype only: while Google Maps pricing is not connected, sample routes
// (Suvarnabhumi Airport → Hilton Pattaya, and → Koh Kood) show the full results
// screen. Geometry and distance come from the public OSRM router in the browser.

export const DEMO_PICKUP = { latitude: 13.6900, longitude: 100.7501 };
export const DEMO_DROPOFF = { latitude: 12.9346, longitude: 100.8836 };

// Rough path along Motorway 7, used only if OSRM cannot be reached.
const FALLBACK_PATH: [number, number][] = [
  [13.69, 100.7501], [13.662, 100.787], [13.63, 100.83], [13.56, 100.88], [13.47, 100.94], [13.39, 100.975],
  [13.3, 100.985], [13.2, 100.955], [13.1, 100.93], [13.02, 100.915], [12.965, 100.9], [12.9346, 100.8836],
];

// Prototype fares in THB; not live pricing.
export const DEMO_PRICES: Record<string, number> = { economy_sedan: 1400, comfort_bmw: 2000, comfort_suv: 1700, premium_minivan: 2400 };

// Koh Kood: the car drives to Laem Sok pier (Trat); the island hotel is the drop-off point.
const KOH_KOOD = { latitude: 11.6560, longitude: 102.5620 };
const LAEM_SOK_PIER = { latitude: 12.0310, longitude: 102.5850 };
const KOOD_FALLBACK: [number, number][] = [
  [13.69, 100.7501], [13.56, 100.88], [13.3, 100.985], [13.02, 100.95], [12.78, 101.2], [12.68, 101.6], [12.6, 102.0],
  [12.45, 102.25], [12.25, 102.5], [12.12, 102.56], [12.031, 102.585],
];
const KOOD_PRICES: Record<string, number> = { economy_sedan: 5200, comfort_bmw: 7200, comfort_suv: 6200, premium_minivan: 8400 };

export type DemoTrip = { id: "pattaya" | "koh-kood"; dropoff: { latitude: number; longitude: number }; driveTo: { latitude: number; longitude: number }; prices: Record<string, number>; fallback: [number, number][]; fallbackMeters: number; fallbackSeconds: number };

/** Which sample route (if any) the typed pickup and drop-off match. */
export function demoTripFor(pickup: string, dropoff: string): DemoTrip | null {
  if (!/suvarnabhumi|\bbkk\b/i.test(pickup)) return null;
  if (/hilton/i.test(dropoff) && /pattaya/i.test(dropoff)) return { id: "pattaya", dropoff: DEMO_DROPOFF, driveTo: DEMO_DROPOFF, prices: DEMO_PRICES, fallback: FALLBACK_PATH, fallbackMeters: 125_000, fallbackSeconds: 100 * 60 };
  if (/koh\s*k(oo|u)d|เกาะกูด/i.test(dropoff)) return { id: "koh-kood", dropoff: KOH_KOOD, driveTo: LAEM_SOK_PIER, prices: KOOD_PRICES, fallback: KOOD_FALLBACK, fallbackMeters: 370_000, fallbackSeconds: 290 * 60 };
  return null;
}

export function isDemoRoute(pickup: string, dropoff: string) {
  return demoTripFor(pickup, dropoff) !== null;
}

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, byte: number;
      do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export async function fetchDemoRoute(trip?: DemoTrip | null) {
  const to = trip?.driveTo ?? DEMO_DROPOFF;
  const coords = `${DEMO_PICKUP.longitude},${DEMO_PICKUP.latitude};${to.longitude},${to.latitude}`;
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`, { signal: AbortSignal.timeout(6000) });
    const body = (await response.json()) as { routes?: { distance: number; duration: number; geometry: string }[] };
    const route = body.routes?.[0];
    if (route) return { distanceMeters: route.distance, durationSeconds: route.duration, path: decodePolyline(route.geometry) };
  } catch { /* use fallback */ }
  return { distanceMeters: trip?.fallbackMeters ?? 125_000, durationSeconds: trip?.fallbackSeconds ?? 100 * 60, path: trip?.fallback ?? FALLBACK_PATH };
}

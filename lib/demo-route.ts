// Prototype only: while Google Maps pricing is not connected, one sample
// route (Suvarnabhumi Airport → Hilton Pattaya) shows the full results screen.
// Geometry and distance come from the public OSRM router in the browser.

export const DEMO_PICKUP = { latitude: 13.6900, longitude: 100.7501 };
export const DEMO_DROPOFF = { latitude: 12.9346, longitude: 100.8836 };

// Rough path along Motorway 7, used only if OSRM cannot be reached.
const FALLBACK_PATH: [number, number][] = [
  [13.69, 100.7501], [13.662, 100.787], [13.63, 100.83], [13.56, 100.88], [13.47, 100.94], [13.39, 100.975],
  [13.3, 100.985], [13.2, 100.955], [13.1, 100.93], [13.02, 100.915], [12.965, 100.9], [12.9346, 100.8836],
];

// Prototype fares in THB; not live pricing.
export const DEMO_PRICES: Record<string, number> = { economy_sedan: 1500, comfort_bmw: 2300, comfort_suv: 2600, premium_minivan: 3300 };

export function isDemoRoute(pickup: string, dropoff: string) {
  return /suvarnabhumi|\bbkk\b/i.test(pickup) && /hilton/i.test(dropoff) && /pattaya/i.test(dropoff);
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

export async function fetchDemoRoute() {
  const coords = `${DEMO_PICKUP.longitude},${DEMO_PICKUP.latitude};${DEMO_DROPOFF.longitude},${DEMO_DROPOFF.latitude}`;
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`, { signal: AbortSignal.timeout(6000) });
    const body = (await response.json()) as { routes?: { distance: number; duration: number; geometry: string }[] };
    const route = body.routes?.[0];
    if (route) return { distanceMeters: route.distance, durationSeconds: route.duration, path: decodePolyline(route.geometry) };
  } catch { /* use fallback */ }
  return { distanceMeters: 125_000, durationSeconds: 100 * 60, path: FALLBACK_PATH };
}

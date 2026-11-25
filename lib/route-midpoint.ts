// The point halfway along a route line, by distance travelled (not the middle
// vertex, which drifts toward wherever the road has more bends). The results map
// pins the time/distance card there.

type Point = readonly [lat: number, lng: number];

const RAD = Math.PI / 180;

/** Great-circle distance in metres between two [lat, lng] points. */
function metres([lat1, lng1]: Point, [lat2, lng2]: Point) {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2
    + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lng2 - lng1) * RAD) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Halfway point of the line, or null for an empty line. */
export function routeMidpoint(points: readonly Point[]): [number, number] | null {
  if (!points.length) return null;
  if (points.length === 1) return [points[0][0], points[0][1]];
  const legs = points.slice(1).map((point, i) => metres(points[i], point));
  let remaining = legs.reduce((sum, leg) => sum + leg, 0) / 2;
  for (let i = 0; i < legs.length; i++) {
    if (remaining <= legs[i] && legs[i] > 0) {
      const f = remaining / legs[i];
      const [a, b] = [points[i], points[i + 1]];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    remaining -= legs[i];
  }
  const last = points[points.length - 1];
  return [last[0], last[1]];
}

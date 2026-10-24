import type { Point } from "./trip-plan";

export type TravelRow = { a: string; b: string; min: number };
export const pointKey = (p: Point) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

/** Provider responses are untrusted: one failed element must not break the whole itinerary. */
export function matrixRows(data: unknown, points: Point[]): TravelRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((r) => {
    if (!r || typeof r !== "object" || (r.status?.code != null && r.status.code !== 0) || r.condition !== "ROUTE_EXISTS"
      || !Number.isInteger(r.originIndex) || !Number.isInteger(r.destinationIndex)
      || !points[r.originIndex] || !points[r.destinationIndex]
      || typeof r.duration !== "string" || !/^\d+(?:\.\d+)?s$/.test(r.duration)) return [];
    const seconds = Number(r.duration.slice(0, -1));
    if (!Number.isFinite(seconds)) return [];
    return [{ a: pointKey(points[r.originIndex]), b: pointKey(points[r.destinationIndex]), min: Math.ceil(seconds / 60) }];
  });
}

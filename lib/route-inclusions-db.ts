import type { Point } from "./pricing";
import { resolveInclusions, ROUTE_RULES } from "./route-inclusions";

// Kept async so callers don't change; the routes now live in code (lib/route-inclusions.ts).
export async function loadInclusions(pickup: Point, dropoff: Point) {
  return resolveInclusions(pickup, dropoff, ROUTE_RULES);
}

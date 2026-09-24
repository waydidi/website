import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { routeInclusions } from "@/db/schema";
import type { Point } from "./pricing";
import { DEFAULT_RULES, resolveInclusions } from "./route-inclusions";

export async function loadInclusions(pickup: Point, dropoff: Point) {
  try {
    const rules = await getDb().select().from(routeInclusions).where(eq(routeInclusions.active, true));
    return resolveInclusions(pickup, dropoff, rules.length ? rules : DEFAULT_RULES);
  } catch {
    // No table yet (migration not applied): use the built-in rules.
    return resolveInclusions(pickup, dropoff, DEFAULT_RULES);
  }
}

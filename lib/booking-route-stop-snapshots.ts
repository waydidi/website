import { env } from "cloudflare:workers";
import type { SecurityDatabase } from "./worker-db";
import { ensureBookingRouteStops } from "@/lib/route-stops-db";

/** Bulk read for staff lists; no catalogue lookups and no per-card database requests. */
export async function bookingRouteStopSnapshots(references: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!references.length) return result;
  await ensureBookingRouteStops();
  const unique = [...new Set(references)];
  for (let index = 0; index < unique.length; index += 80) {
    const batch = unique.slice(index, index + 80);
    const rows = await (env.DB as SecurityDatabase).prepare(`SELECT booking_reference,route_stops_json FROM booking_route_stops WHERE booking_reference IN (${batch.map(() => "?").join(",")})`).bind(...batch).all<{ booking_reference: string; route_stops_json: string }>();
    for (const row of rows.results) result.set(row.booking_reference, row.route_stops_json);
  }
  return result;
}

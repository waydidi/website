import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { smartTrips } from "@/db/schema";
import { pushLine } from "@/lib/line";
import { inputFromRow, planFor } from "@/lib/smart-trips";

const siteUrl = () => ((env as unknown as Record<string, string | undefined>).WAYDIDI_PUBLIC_URL || "https://waydidi.com").replace(/\/$/, "");

/**
 * The day before each booked trip (from 16:00 Bangkok time): re-check it against the
 * latest attraction data (closures, changed sessions, opening hours) and alert staff on LINE.
 */
export async function checkTomorrowsTrips(at = new Date()) {
  const bangkok = new Date(at.getTime() + 7 * 3600_000);
  if (bangkok.getUTCHours() < 16) return 0;
  const tomorrow = new Date(bangkok.getTime() + 86_400_000).toISOString().slice(0, 10);
  const rows = await getDb().select().from(smartTrips).where(and(eq(smartTrips.tripDate, tomorrow), eq(smartTrips.status, "accepted"), isNull(smartTrips.dayCheckedAt))).limit(40);
  let alerts = 0;
  for (const trip of rows) {
    const [claimed] = await getDb().update(smartTrips).set({ dayCheckedAt: at.toISOString() }).where(and(eq(smartTrips.id, trip.id), isNull(smartTrips.dayCheckedAt))).returning({ id: smartTrips.id });
    if (!claimed) continue;
    const planned = await planFor(inputFromRow(trip)).catch(() => null);
    const problems = planned?.plan.problems.filter((p) => p.level === "error").map((p) => p.message) ?? [];
    if (!problems.length) continue;
    alerts++;
    await pushLine([{ type: "text", text: `⚠️ Tomorrow's trip ${trip.ref} needs a look (${trip.customerName ?? "guest"}, pickup ${trip.startTime}):\n${problems.slice(0, 5).map((p) => `• ${p}`).join("\n")}\n${siteUrl()}/admin/trips/${trip.id}` }]).catch(() => undefined);
  }
  return alerts;
}

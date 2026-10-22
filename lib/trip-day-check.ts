import { publicSiteUrl } from "@/lib/site";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { smartTrips } from "@/db/schema";
import { alertStaff } from "@/lib/staff-alert";
import { esc } from "@/lib/telegram/cards";
import { inputFromRow, planFor } from "@/lib/smart-trips";

const siteUrl = () => publicSiteUrl((env as unknown as Record<string, string | undefined>).WAYDIDI_PUBLIC_URL);

/**
 * The day before each booked trip (from 16:00 Bangkok time): re-check it against the
 * latest attraction data (closures, changed sessions, opening hours) and alert staff (LINE and the Telegram Admin group).
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
    const link = `${siteUrl()}/admin/trips/${trip.id}`, list = problems.slice(0, 5);
    await alertStaff(`⚠️ Tomorrow's trip ${trip.ref} needs a look (${trip.customerName ?? "guest"}, pickup ${trip.startTime}):\n${list.map((p) => `• ${p}`).join("\n")}\n${link}`,
      `⚠️ ทริปพรุ่งนี้ <b>${esc(trip.ref)}</b> ต้องตรวจสอบ (${esc(trip.customerName ?? "ลูกค้า")}, รับ ${esc(trip.startTime)})\n${list.map((p) => `• ${esc(p)}`).join("\n")}\n${esc(link)}`);
  }
  return alerts;
}

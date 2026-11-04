import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookings, drivers } from "@/db/schema";
import { journeysFor } from "@/lib/journey-legs";
import { publicSiteUrl } from "@/lib/site";
import { VEHICLES } from "@/lib/vehicles";
import { telegramChatId, telegramConfigured } from "./client";
import { dailyJobsDue, dailyJobsMessages, type DailyJob, type DailySlot } from "./daily-jobs-rules";
import { queueTelegram } from "./outbox";

// The Admin group gets today's jobs at 07:00 and tomorrow's at 18:00 (Bangkok time), one line per confirmed leg:
// time, reference, route, car, people, driver (or "no driver yet") and payment. Staff only; never the customer.
// On unless the Worker variable TELEGRAM_DAILY_JOBS=0. Each list goes through the Telegram outbox with an id per
// date and slot, so a retry or two runs at once post it once; a mark in app_settings skips the work afterwards.
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<unknown> } } };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
export const dailyJobsOn = () => vars().TELEGRAM_DAILY_JOBS !== "0" && telegramConfigured();

/** The confirmed legs picked up on that date, with their driver and payment. */
export async function jobsOn(date: string): Promise<DailyJob[]> {
  const rows = await getDb().select().from(bookings)
    .where(and(eq(bookings.status, "confirmed"), isNull(bookings.binnedAt), or(eq(bookings.pickupDate, date), eq(bookings.returnDate, date))));
  const legs = (await journeysFor(rows)).filter((j) => j.pickupDate === date && j.status === "confirmed");
  if (!legs.length) return [];
  const refs = [...new Set(legs.map((j) => j.reference))];
  const assigned = await getDb().select({ ref: bookingAssignments.bookingReference, leg: bookingAssignments.leg, driverId: bookingAssignments.driverId })
    .from(bookingAssignments).where(and(inArray(bookingAssignments.bookingReference, refs), isNull(bookingAssignments.revokedAt)));
  const driverIds = [...new Set(assigned.map((a) => a.driverId))];
  const names = new Map(driverIds.length ? (await getDb().select({ id: drivers.id, name: drivers.fullName }).from(drivers).where(inArray(drivers.id, driverIds))).map((d) => [d.id, d.name]) : []);
  const driverFor = new Map(assigned.map((a) => [`${a.ref}:${a.leg}`, names.get(a.driverId) ?? null]));
  return legs.map((j) => ({
    time: j.pickupTime, reference: j.reference, leg: j.leg, from: j.pickup, to: j.dropoff,
    vehicleName: (VEHICLES as Record<string, { name: string }>)[j.vehicle]?.name ?? j.vehicle.replaceAll("_", " "),
    passengers: j.passengers, driver: driverFor.get(`${j.reference}:${j.leg}`) ?? null,
    payment: j.paymentStatus === "paid" ? "paid" : j.paymentMethod === "cash" ? "cash" : "unpaid",
  }));
}

/** Cron (every minute): posts the list that is due, once per date and slot. Returns the lists sent. */
export async function sendDailyJobs(at = new Date()): Promise<{ slot: DailySlot; date: string; messages: number }[]> {
  if (!dailyJobsOn()) return [];
  const sent: { slot: DailySlot; date: string; messages: number }[] = [];
  for (const { slot, date } of dailyJobsDue(at)) {
    const mark = `tg_daily_jobs:${date}:${slot}`;
    if (await db().prepare("SELECT 1 x FROM app_settings WHERE key=?").bind(mark).first()) continue;
    const messages = dailyJobsMessages(slot, date, await jobsOn(date), `${publicSiteUrl(vars().WAYDIDI_PUBLIC_URL)}/admin/bookings`);
    for (const [i, text] of messages.entries())
      await queueTelegram({ id: `daily-jobs:${date}:${slot}:${i + 1}`, destination: telegramChatId(), payload: { text } });
    await db().prepare("INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES(?,?,?)").bind(mark, String(messages.length), at.toISOString()).run();
    sent.push({ slot, date, messages: messages.length });
  }
  return sent;
}

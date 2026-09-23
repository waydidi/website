import { env } from "cloudflare:workers";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, driverStatusEvents } from "@/db/schema";

export async function permanentlyDeleteBooking(reference: string) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return false;
  const evidence = await getDb().select({ key: driverStatusEvents.evidenceKey }).from(driverStatusEvents).where(eq(driverStatusEvents.bookingReference, reference));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM driver_status_events WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM booking_notifications WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM operations_alerts WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM booking_assignments WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM driver_offers WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM booking_costs WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM booking_management_sessions WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM booking_changes WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM booking_events WHERE booking_reference = ?").bind(reference),
    env.DB.prepare("DELETE FROM bookings WHERE reference = ?").bind(reference),
  ]);
  if (env.BUCKET) {
    const keys = [booking.pdfKey, ...evidence.map((row) => row.key)].filter((key): key is string => Boolean(key));
    await Promise.all(keys.map((key) => env.BUCKET.delete(key))).catch(() => undefined);
  }
  return true;
}

export async function purgeExpiredBookings() {
  const now = new Date().toISOString();
  const expired = await getDb().select({ reference: bookings.reference }).from(bookings).where(and(eq(bookings.status, "binned"), lte(bookings.purgeAfter, now))).limit(50);
  for (const row of expired) await permanentlyDeleteBooking(row.reference);
  return expired.length;
}

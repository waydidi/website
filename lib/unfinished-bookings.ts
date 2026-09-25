import { and, desc, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingNotifications, bookings, customerBookingLinks, customers, fareQuotes } from "@/db/schema";
import { rebookQuery } from "@/lib/customer-account";
import { sendUnfinishedBookingEmail } from "@/lib/email";

const HOUR = 3_600_000;
const TYPE = "member_unfinished";

// Signed-in members whose booking stopped at payment (expired or failed) get one
// email 1–48 hours later, unless they have booked since or were nudged in the last 3 days.
export async function sendUnfinishedBookingReminders(at = new Date()) {
  const db = getDb();
  const now = at.getTime();
  const rows = await db.select({ booking: bookings, customer: customers })
    .from(bookings)
    .innerJoin(customerBookingLinks, eq(customerBookingLinks.bookingReference, bookings.reference))
    .innerJoin(customers, eq(customers.id, customerBookingLinks.customerId))
    .where(and(inArray(bookings.status, ["expired", "payment_failed"]), gte(bookings.createdAt, new Date(now - 48 * HOUR).toISOString()), lte(bookings.createdAt, new Date(now - HOUR).toISOString())))
    .orderBy(desc(bookings.createdAt));
  let sent = 0;
  const seen = new Set<string>();
  for (const { booking, customer } of rows) {
    if (seen.has(customer.id)) continue; // newest unfinished booking only
    seen.add(customer.id);
    const pickupAt = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
    if (pickupAt - now < 6 * HOUR) continue; // too close to the trip to be useful
    const [bookedSince] = await db.select({ ref: bookings.reference }).from(bookings)
      .innerJoin(customerBookingLinks, eq(customerBookingLinks.bookingReference, bookings.reference))
      .where(and(eq(customerBookingLinks.customerId, customer.id), inArray(bookings.status, ["confirmed", "completed"]), gt(bookings.createdAt, booking.createdAt))).limit(1);
    if (bookedSince) continue;
    const [recent] = await db.select({ id: bookingNotifications.id }).from(bookingNotifications)
      .where(and(eq(bookingNotifications.notificationType, TYPE), eq(bookingNotifications.recipient, customer.email), gte(bookingNotifications.createdAt, new Date(now - 72 * HOUR).toISOString()))).limit(1);
    if (recent) continue;
    const dedupeKey = `${TYPE}:${booking.reference}`;
    const stamp = at.toISOString();
    const inserted = await db.insert(bookingNotifications).values({ id: crypto.randomUUID(), bookingReference: booking.reference, notificationType: TYPE, channel: "email", recipient: customer.email, dedupeKey, scheduledFor: stamp, status: "processing", attemptCount: 1, lastAttemptAt: stamp, createdAt: stamp, updatedAt: stamp }).onConflictDoNothing().returning({ id: bookingNotifications.id });
    if (!inserted.length) continue;
    let places: { pickupPlaceId: string; dropoffPlaceId: string } | null = null;
    if (booking.fareQuoteId) {
      const [quote] = await db.select({ pickupPlaceId: fareQuotes.pickupPlaceId, dropoffPlaceId: fareQuotes.dropoffPlaceId }).from(fareQuotes).where(eq(fareQuotes.id, booking.fareQuoteId)).limit(1).catch(() => []);
      if (quote) places = quote;
    }
    const delivery = await sendUnfinishedBookingEmail({ to: customer.email, name: customer.name || "there", reference: booking.reference, destination: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime, path: rebookQuery(booking, places, "again") }).catch(() => ({ status: "failed" }));
    const ok = delivery.status === "sent";
    await db.update(bookingNotifications).set({ status: ok ? "sent" : "failed", sentAt: ok ? stamp : null, updatedAt: stamp }).where(eq(bookingNotifications.dedupeKey, dedupeKey));
    if (ok) sent += 1;
  }
  return sent;
}

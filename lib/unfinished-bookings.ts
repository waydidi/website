import { and, desc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingNotifications, bookings, customerBookingLinks, customers, fareQuotes } from "@/db/schema";
import { rebookQuery } from "@/lib/customer-account";
import { enqueueCrmEmail } from "@/lib/crm-email-queue";

const HOUR = 3_600_000;
const TYPE = "member_unfinished";

// Signed-in members whose booking stopped at payment (expired or failed) get one
// email 1–48 hours later, unless they have booked since or were nudged in the last 3 days.
export async function sendUnfinishedBookingReminders(at = new Date()) {
  const db = getDb();
  const now = at.getTime();
  const rows = await db.select({ booking: {reference:bookings.reference,pickup:bookings.pickup,dropoff:bookings.dropoff,pickupDate:bookings.pickupDate,pickupTime:bookings.pickupTime,passengers:bookings.passengers,luggage:bookings.luggage,vehicle:bookings.vehicle,serviceType:bookings.serviceType,bookedHours:bookings.bookedHours,fareQuoteId:bookings.fareQuoteId,createdAt:bookings.createdAt}, customer:{id:customers.id,email:customers.email,name:customers.name} })
    .from(bookings)
    .innerJoin(customerBookingLinks, eq(customerBookingLinks.bookingReference, bookings.reference))
    .innerJoin(customers, eq(customers.id, customerBookingLinks.customerId))
    .where(and(inArray(bookings.status, ["expired", "payment_failed"]), or(and(gte(bookings.createdAt,new Date(now-48*HOUR).toISOString()),lte(bookings.createdAt,new Date(now-HOUR).toISOString())),sql`exists(select 1 from booking_notifications n where n.booking_reference="bookings"."reference" and n.notification_type=${TYPE} and n.status in ('failed','processing','pending'))`)))
    .orderBy(desc(bookings.createdAt));
  const sent = 0;
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
      .where(and(eq(bookingNotifications.notificationType, TYPE), eq(bookingNotifications.recipient, customer.email), eq(bookingNotifications.status,"sent"), gte(bookingNotifications.createdAt, new Date(now - 72 * HOUR).toISOString()))).limit(1);
    if (recent) continue; // Same booking dedupe is enforced by the outbox below.
    const dedupeKey = `${TYPE}:${booking.reference}`;
    const stamp = at.toISOString();
    let legacyAttempt: string|null=null;
    const inserted = await db.insert(bookingNotifications).values({ id: crypto.randomUUID(), bookingReference: booking.reference, notificationType: TYPE, channel: "email", recipient: customer.email, dedupeKey, scheduledFor: stamp, status: "pending", attemptCount: 0, lastAttemptAt: null, createdAt: stamp, updatedAt: stamp }).onConflictDoNothing().returning({ id: bookingNotifications.id });
    if (!inserted.length) {
      const [existing] = await db.select({status:bookingNotifications.status,lastAttemptAt:bookingNotifications.lastAttemptAt}).from(bookingNotifications).where(eq(bookingNotifications.dedupeKey,dedupeKey)).limit(1);
      if(existing?.status === "sent") continue;
      if(existing && ["failed","processing"].includes(existing.status))legacyAttempt=existing.lastAttemptAt;
    }
    let places: { pickupPlaceId: string; dropoffPlaceId: string } | null = null;
    if (booking.fareQuoteId) {
      const [quote] = await db.select({ pickupPlaceId: fareQuotes.pickupPlaceId, dropoffPlaceId: fareQuotes.dropoffPlaceId }).from(fareQuotes).where(eq(fareQuotes.id, booking.fareQuoteId)).limit(1).catch(() => []);
      if (quote) places = quote;
    }
    const source=await import("@/lib/crm").then(m=>m.crmDb().prepare("SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=?").bind(customer.id).first<{contact_id:string}>());
    await enqueueCrmEmail(dedupeKey, customer.email, {kind:"unfinished", notificationKey:dedupeKey, data:{ to: customer.email, name: customer.name || "there", reference: booking.reference, destination: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime, path: rebookQuery(booking, places, "again") }},source?.contact_id??null);
    if(legacyAttempt)await import("@/lib/crm").then(m=>m.crmDb().prepare("UPDATE crm_outbox SET first_attempt_at=coalesce(first_attempt_at,?) WHERE dedupe_key=?").bind(legacyAttempt,dedupeKey).run());
  }
  return sent;
}

import { env } from "cloudflare:workers";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, operationsAlerts } from "@/db/schema";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { sendConfirmationEmail, sendOperationsAlert } from "@/lib/email";
import { tripPinForReference } from "@/lib/trip-pin";

type Booking = typeof bookings.$inferSelect;

export async function fulfillBooking(booking: Booking, paymentIntentId?: string | null) {
  const now = new Date().toISOString();
  if (booking.fulfillmentStatus === "complete" && booking.status === "confirmed") {
    return { emailStatus: booking.emailStatus, pdfKey: booking.pdfKey };
  }
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [claimed] = await getDb().update(bookings).set({
    fulfillmentStatus: "processing", fulfillmentStartedAt: now, updatedAt: now,
  }).where(and(
    eq(bookings.reference, booking.reference),
    or(
      eq(bookings.fulfillmentStatus, "pending"),
      eq(bookings.fulfillmentStatus, "failed"),
      and(eq(bookings.fulfillmentStatus, "processing"), or(isNull(bookings.fulfillmentStartedAt), lt(bookings.fulfillmentStartedAt, staleBefore))),
    ),
  )).returning();
  if (!claimed) return { emailStatus: booking.emailStatus, pdfKey: booking.pdfKey };
  try {
  const tripPin = await tripPinForReference(booking.reference);
  const pdf = await createConfirmationPdf(booking);
  const pdfKey = `confirmations/${booking.reference}.pdf`;
  if (env.BUCKET) await env.BUCKET.put(pdfKey, pdf, { httpMetadata: { contentType: "application/pdf" } });

  const email = await sendConfirmationEmail({
    to: booking.customerEmail, name: booking.customerName, reference: booking.reference, pdf,
    pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime, vehicle: booking.vehicle, customerPhone: booking.customerPhone,
    passengers: booking.passengers, luggage: booking.luggage, total: booking.total,
    paymentMethod: booking.paymentMethod,
    serviceType: booking.serviceType, bookedHours: booking.bookedHours,
    returnPickup: booking.returnPickup, returnDropoff: booking.returnDropoff,
    returnDate: booking.returnDate, returnTime: booking.returnTime,
    outboundTotal: booking.outboundTotal, returnTotal: booking.returnTotal,
    tripPin,
  });
  await sendOperationsAlert(booking);

  await getDb().update(bookings).set({
    status: "confirmed", paymentIntentId: paymentIntentId ?? booking.paymentIntentId,
    pdfKey, emailStatus: email.status, fulfillmentStatus: "complete", updatedAt: new Date().toISOString(),
  }).where(eq(bookings.reference, booking.reference));
  return { emailStatus: email.status, pdfKey };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await getDb().update(bookings).set({ fulfillmentStatus: "failed", updatedAt: failedAt }).where(eq(bookings.reference, booking.reference));
    await getDb().insert(operationsAlerts).values({
      id: crypto.randomUUID(), bookingReference: booking.reference, alertType: "payment_fulfillment_failed",
      severity: "critical", title: "Paid booking needs confirmation recovery",
      details: "Payment was verified, but confirmation delivery did not finish.",
      dedupeKey: `payment-fulfillment:${booking.reference}`, status: "open", detectedAt: failedAt,
      createdAt: failedAt, updatedAt: failedAt,
    }).onConflictDoUpdate({ target: operationsAlerts.dedupeKey, set: { status: "open", detectedAt: failedAt, updatedAt: failedAt } });
    throw error;
  }
}

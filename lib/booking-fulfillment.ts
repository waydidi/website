import { contactEmails } from "@/lib/booking-contacts";
import { bookingExtras } from "@/lib/booking-extras";
import { env } from "cloudflare:workers";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, operationsAlerts } from "@/db/schema";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { sendConfirmationEmail, sendOperationsAlert } from "@/lib/email";

type Booking = typeof bookings.$inferSelect;

export async function fulfillBooking(booking: Booking, paymentIntentId?: string | null) {
  const now = new Date().toISOString();
  if (["completed", "cancelled", "no_show", "binned"].includes(booking.status) || booking.fulfillmentStatus === "complete") {
    return { emailStatus: booking.emailStatus, pdfKey: booking.pdfKey };
  }
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [claimed] = await getDb().update(bookings).set({
    fulfillmentStatus: "processing", fulfillmentStartedAt: now, updatedAt: now,
  }).where(and(
    eq(bookings.reference, booking.reference),
    or(eq(bookings.status, "pending_payment"), eq(bookings.status, "confirmed"), eq(bookings.status, "expired")),
    or(
      eq(bookings.fulfillmentStatus, "pending"),
      eq(bookings.fulfillmentStatus, "failed"),
      and(eq(bookings.fulfillmentStatus, "processing"), or(isNull(bookings.fulfillmentStartedAt), lt(bookings.fulfillmentStartedAt, staleBefore))),
    ),
  )).returning();
  if (!claimed) return { emailStatus: booking.emailStatus, pdfKey: booking.pdfKey };
  try {
  const extras = await bookingExtras(booking);
  const pdf = await createConfirmationPdf(booking, extras);
  const pdfKey = `confirmations/${booking.reference}.pdf`;
  if (env.BUCKET) await env.BUCKET.put(pdfKey, pdf, { httpMetadata: { contentType: "application/pdf" } });

  const email = await sendConfirmationEmail({
    to: booking.customerEmail, name: booking.customerName, reference: booking.reference, pdf,
    pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime, vehicle: booking.vehicle, customerPhone: booking.customerPhone,
    passengers: booking.passengers, luggage: booking.luggage, total: booking.total,
    paymentMethod: booking.paymentMethod,
    serviceType: booking.serviceType, bookedHours: booking.bookedHours, pricingArea: booking.pricingArea,
    returnPickup: booking.returnPickup, returnDropoff: booking.returnDropoff,
    returnDate: booking.returnDate, returnTime: booking.returnTime,
    outboundTotal: booking.outboundTotal, returnTotal: booking.returnTotal,
    extras, surname: booking.customerSurname, flightNumber: booking.flightNumber,
  });
  // Copies for the booker or anyone the customer added. A failed copy never blocks the booking.
  for (const copyTo of await contactEmails(booking.reference)) {
    await sendConfirmationEmail({
      to: copyTo, name: "there", reference: booking.reference, pdf,
      pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate,
      pickupTime: booking.pickupTime, vehicle: booking.vehicle, customerPhone: booking.customerPhone,
      passengers: booking.passengers, luggage: booking.luggage, total: booking.total,
      paymentMethod: booking.paymentMethod,
      serviceType: booking.serviceType, bookedHours: booking.bookedHours, pricingArea: booking.pricingArea,
      returnPickup: booking.returnPickup, returnDropoff: booking.returnDropoff,
      returnDate: booking.returnDate, returnTime: booking.returnTime,
      outboundTotal: booking.outboundTotal, returnTotal: booking.returnTotal,
      extras, flightNumber: booking.flightNumber,
    }).catch(() => undefined);
  }
  // Waydidi gets the same email and PDF as the customer; the plain alert is only a fallback.
  const office = await (env.BOOKING_ALERT_EMAIL ? sendConfirmationEmail({
    to: env.BOOKING_ALERT_EMAIL, name: booking.customerName, surname: booking.customerSurname, flightNumber: booking.flightNumber,
    subject: `New booking ${booking.reference} · ${[booking.customerName, booking.customerSurname].filter(Boolean).join(" ")}`,
    reference: booking.reference, pdf,
    pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime, vehicle: booking.vehicle, customerPhone: booking.customerPhone,
    passengers: booking.passengers, luggage: booking.luggage, total: booking.total,
    paymentMethod: booking.paymentMethod,
    serviceType: booking.serviceType, bookedHours: booking.bookedHours, pricingArea: booking.pricingArea,
    returnPickup: booking.returnPickup, returnDropoff: booking.returnDropoff,
    returnDate: booking.returnDate, returnTime: booking.returnTime,
    outboundTotal: booking.outboundTotal, returnTotal: booking.returnTotal,
    extras,
  }).catch(() => ({ status: "failed" as const })) : Promise.resolve({ status: "failed" as const }));
  if (office.status !== "sent") await sendOperationsAlert(booking).catch(() => undefined);

  await getDb().update(bookings).set({
    status: "confirmed", paymentIntentId: paymentIntentId ?? booking.paymentIntentId,
    pdfKey, emailStatus: email.status, fulfillmentStatus: "complete", updatedAt: new Date().toISOString(),
  }).where(and(eq(bookings.reference, booking.reference),or(eq(bookings.status,"pending_payment"),eq(bookings.status,"expired"),eq(bookings.status,"confirmed"))));
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

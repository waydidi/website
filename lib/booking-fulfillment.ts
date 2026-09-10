import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { sendConfirmationEmail, sendOperationsAlert } from "@/lib/email";

type Booking = typeof bookings.$inferSelect;

export async function fulfillBooking(booking: Booking, paymentIntentId?: string | null) {
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
  });
  await sendOperationsAlert(booking);

  const now = new Date().toISOString();
  await getDb().update(bookings).set({
    status: "confirmed", paymentIntentId: paymentIntentId ?? booking.paymentIntentId,
    pdfKey, emailStatus: email.status, updatedAt: now,
  }).where(eq(bookings.reference, booking.reference));
  return { emailStatus: email.status, pdfKey };
}

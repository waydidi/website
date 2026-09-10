import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookings } from "@/db/schema";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { sendConfirmationEmail } from "@/lib/email";
import { constantTimeEqual, isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  const { reference } = await context.params;
  const input = await request.json() as { token?: string };
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || !input.token || !constantTimeEqual(await sha256(input.token), booking.accessTokenHash)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "Booking is not confirmed." }, { status: 409 });
  if (Date.now() - new Date(booking.updatedAt).getTime() < 60_000) return NextResponse.json({ error: "Please wait one minute before retrying." }, { status: 429 });

  const pdf = await createConfirmationPdf(booking);
  if (booking.pdfKey && env.BUCKET) await env.BUCKET.put(booking.pdfKey, pdf, { httpMetadata: { contentType: "application/pdf" } });
  const email = await sendConfirmationEmail({
    to: booking.customerEmail, name: booking.customerName, reference, pdf,
    pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime, vehicle: booking.vehicle, customerPhone: booking.customerPhone,
    passengers: booking.passengers, luggage: booking.luggage, total: booking.total,
    paymentMethod: booking.paymentMethod, retryId: crypto.randomUUID(),
  });
  const now = new Date().toISOString();
  await getDb().update(bookings).set({ emailStatus: email.status, updatedAt: now }).where(eq(bookings.reference, reference));
  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: `confirmation_email_${email.status}`, createdAt: now });
  return NextResponse.json({ emailStatus: email.status });
}

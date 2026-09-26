import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { bookingExtras } from "@/lib/booking-extras";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { sendConfirmationEmail } from "@/lib/email";
import { sameOrigin } from "@/lib/security";
import { tripPinForReference } from "@/lib/trip-pin";

async function load(reference: string) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  return booking ?? null;
}

// Admin: download any booking's confirmation PDF.
export async function GET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reference } = await context.params;
  const booking = await load(reference);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const pdf = await createConfirmationPdf(booking, await bookingExtras(booking));
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="Waydidi-${reference}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}

// Admin: email the confirmation (with the PDF) to the customer again.
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reference } = await context.params;
  const booking = await load(reference);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const extras = await bookingExtras(booking);
  const pdf = await createConfirmationPdf(booking, extras);
  const email = await sendConfirmationEmail({
    to: booking.customerEmail, name: booking.customerName, reference: booking.reference, pdf,
    pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime, vehicle: booking.vehicle, customerPhone: booking.customerPhone,
    passengers: booking.passengers, luggage: booking.luggage, total: booking.total,
    paymentMethod: booking.paymentMethod, serviceType: booking.serviceType, bookedHours: booking.bookedHours,
    returnPickup: booking.returnPickup, returnDropoff: booking.returnDropoff,
    returnDate: booking.returnDate, returnTime: booking.returnTime,
    outboundTotal: booking.outboundTotal, returnTotal: booking.returnTotal,
    extras, tripPin: await tripPinForReference(booking.reference),
  });
  await getDb().update(bookings).set({ emailStatus: email.status, updatedAt: new Date().toISOString() }).where(eq(bookings.reference, reference));
  if (email.status !== "sent") return NextResponse.json({ error: email.status === "pending_configuration" ? "Email isn't set up yet." : "The email could not be sent." }, { status: 502 });
  return NextResponse.json({ ok: true });
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookings } from "@/db/schema";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import { constantTimeEqual, isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { retrieveCheckoutSession } from "@/lib/stripe";

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  const { reference } = await context.params;
  const input = await request.json() as { token?: string; sessionId?: string };
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || !input.token || !constantTimeEqual(await sha256(input.token), booking.accessTokenHash)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "confirmed") return NextResponse.json({ status: booking.status });
  if (!input.sessionId || input.sessionId !== booking.checkoutSessionId) return NextResponse.json({ error: "Checkout session does not match." }, { status: 400 });

  const session = await retrieveCheckoutSession(input.sessionId);
  if (session.payment_status !== "paid" || session.currency !== "thb" || session.amount_total !== booking.total * 100 || session.metadata?.booking_reference !== reference) {
    return NextResponse.json({ status: "pending_payment" }, { status: 202 });
  }
  const providerEventId = `payment:${session.id}`;
  const [processed] = await getDb().select().from(bookingEvents).where(eq(bookingEvents.providerEventId, providerEventId)).limit(1);
  if (!processed) await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "payment_verified", providerEventId, createdAt: new Date().toISOString() });
  await fulfillBooking(booking, session.payment_intent ?? null);
  return NextResponse.json({ status: "confirmed" });
}

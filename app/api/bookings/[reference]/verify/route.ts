import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { reconcileBooking } from "@/lib/payment-reconciliation";
import { constantTimeEqual, isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  const { reference } = await context.params;
  const input = await request.json() as { token?: string; sessionId?: string };
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.status === "binned" || !input.token || !constantTimeEqual(await sha256(input.token), booking.accessTokenHash)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "confirmed" && booking.paymentStatus === "paid") return NextResponse.json({ status: booking.status, paymentStatus: booking.paymentStatus });
  if (!input.sessionId || input.sessionId !== booking.checkoutSessionId) return NextResponse.json({ error: "Checkout session does not match." }, { status: 400 });
  const result = await reconcileBooking(reference, "customer_return");
  const confirmed = result.status === "paid";
  return NextResponse.json({ status: confirmed ? "confirmed" : "pending_payment", paymentStatus: result.status }, { status: confirmed ? 200 : 202 });
}

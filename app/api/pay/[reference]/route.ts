import { validBookingQuotes } from "@/lib/booking-quote-check";
import { toSatang } from "@/lib/money";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { constantTimeEqual, sha256 } from "@/lib/security";

// The embedded Stripe form's client secret, for the booking's own open session only.
export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const sessionId = url.searchParams.get("session_id") ?? "";
  const publishableKey = String((env as Record<string, unknown>).STRIPE_PUBLISHABLE_KEY ?? "");
  if (!publishableKey.startsWith("pk_")) return NextResponse.json({ error: "Card payment isn't set up yet." }, { status: 503 });
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference.toUpperCase())).limit(1);
  if (!booking || !token || !constantTimeEqual(await sha256(token), booking.accessTokenHash) || booking.checkoutSessionId !== sessionId) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "pending_payment") return NextResponse.json({ done: true });
  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (session.status === "complete") return NextResponse.json({ done: true });
    if(!await validBookingQuotes(booking)) return NextResponse.json({error:"Your quote expired or pricing changed. Search again for fresh outbound and return prices."},{status:409});
    if(session.amount_total!==toSatang(booking.total)||session.currency!=="thb"||session.metadata?.booking_reference!==booking.reference) return NextResponse.json({error:"The payment amount does not match your booking."},{status:409});
    if (!session.client_secret || session.status !== "open") return NextResponse.json({ error: "This payment has expired. Please book again." }, { status: 410 });
    return NextResponse.json({ clientSecret: session.client_secret, publishableKey, total: booking.total, journey:{pickup:booking.pickup,dropoff:booking.dropoff,date:booking.pickupDate,time:booking.pickupTime,vehicle:booking.vehicle,passengers:booking.passengers,luggage:booking.luggage,returnDate:booking.returnDate,returnTime:booking.returnTime} }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Payment could not be loaded. Please try again." }, { status: 503 });
  }
}

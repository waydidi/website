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
  const [booking] = await getDb().select({ status: bookings.status, accessTokenHash: bookings.accessTokenHash, checkoutSessionId: bookings.checkoutSessionId, total: bookings.total }).from(bookings).where(eq(bookings.reference, reference.toUpperCase())).limit(1);
  if (!booking || !token || !constantTimeEqual(await sha256(token), booking.accessTokenHash) || booking.checkoutSessionId !== sessionId) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "pending_payment") return NextResponse.json({ done: true });
  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (session.status === "complete") return NextResponse.json({ done: true });
    if (!session.client_secret || session.status !== "open") return NextResponse.json({ error: "This payment has expired. Please book again." }, { status: 410 });
    return NextResponse.json({ clientSecret: session.client_secret, publishableKey, total: booking.total }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Payment could not be loaded. Please try again." }, { status: 503 });
  }
}

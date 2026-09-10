import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookings } from "@/db/schema";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import { constantTimeEqual } from "@/lib/security";

function signatureParts(header: string) {
  const parts = header.split(",").map((part) => part.split("="));
  return { timestamp: parts.find(([key]) => key === "t")?.[1], signatures: parts.filter(([key]) => key === "v1").map(([, value]) => value) };
}
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  if (!env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  const raw = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";
  const { timestamp, signatures } = signatureParts(header);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const expected = await hmac(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${raw}`);
  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  const event = JSON.parse(raw) as { id: string; type: string; data: { object: { id: string; payment_intent?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { booking_reference?: string } } } };
  if (event.type !== "checkout.session.completed") return NextResponse.json({ received: true });
  const session = event.data.object;
  const reference = session.metadata?.booking_reference;
  if (!reference || session.payment_status !== "paid" || session.currency !== "thb") return NextResponse.json({ error: "Invalid payment event" }, { status: 400 });
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || session.amount_total !== booking.total * 100 || session.id !== booking.checkoutSessionId) return NextResponse.json({ error: "Payment mismatch" }, { status: 400 });
  const paymentEventId = `payment:${session.id}`;
  const [processed] = await getDb().select().from(bookingEvents).where(eq(bookingEvents.providerEventId, paymentEventId)).limit(1);
  if (processed) {
    if (booking.status !== "confirmed") await fulfillBooking(booking, session.payment_intent ?? null);
    return NextResponse.json({ received: true });
  }

  const now = new Date().toISOString();
  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "payment_confirmed", providerEventId: paymentEventId, createdAt: now });
  await fulfillBooking(booking, session.payment_intent ?? null);
  return NextResponse.json({ received: true });
}

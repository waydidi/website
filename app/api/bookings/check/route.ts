import { env } from "cloudflare:workers";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookings, checkoutAttempts } from "@/db/schema";
import { constantTimeEqual, isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });

  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
  const agent = request.headers.get("user-agent") ?? "unknown";
  const fingerprint = await sha256(`lookup:${env.RATE_LIMIT_SALT ?? "waydidi-lookup"}:${address}:${agent}`);
  const rateWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(checkoutAttempts).where(and(eq(checkoutAttempts.fingerprintHash, fingerprint), gt(checkoutAttempts.createdAt, rateWindow)));
  if (attempts >= 10) return NextResponse.json({ error: "Too many lookup attempts. Please wait 15 minutes and try again." }, { status: 429, headers: { "Retry-After": "900" } });
  await getDb().insert(checkoutAttempts).values({ fingerprintHash: fingerprint, createdAt: new Date().toISOString() });
  await getDb().delete(checkoutAttempts).where(lt(checkoutAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()));

  const input = await request.json() as { reference?: unknown; email?: unknown };
  const reference = typeof input.reference === "string" ? input.reference.trim().toUpperCase() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^WD-[A-F0-9]{12}$/.test(reference) || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid booking reference and email." }, { status: 400 });
  }

  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  const emailMatches = booking ? constantTimeEqual(await sha256(email), await sha256(booking.customerEmail.toLowerCase())) : false;
  if (!booking || !emailMatches) return NextResponse.json({ error: "We could not find a booking matching those details." }, { status: 404 });

  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "customer_booking_lookup", createdAt: new Date().toISOString() });
  return NextResponse.json({
    reference: booking.reference,
    status: booking.status,
    pickup: booking.pickup,
    dropoff: booking.dropoff,
    pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime,
    passengers: booking.passengers,
    luggage: booking.luggage,
    vehicle: booking.vehicle,
    total: booking.total,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

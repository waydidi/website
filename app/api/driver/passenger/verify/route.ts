import { env } from "cloudflare:workers";
import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings, passengerVerifications } from "@/db/schema";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { constantTimeEqual, isJsonRequest, sameOrigin } from "@/lib/security";
import { tripPinForReference, tripPinHash } from "@/lib/trip-pin";

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json() as { token?: string; pin?: string; latitude?: number; longitude?: number; accuracy?: number };
  const assignment = await activeAssignmentForToken(input.token ?? "");
  if (!assignment) return NextResponse.json({ error: "This driver link is invalid, expired, or revoked." }, { status: 404 });
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, assignment.bookingReference)).limit(1);
  if (!booking || booking.status !== "confirmed") return NextResponse.json({ error: "This booking is no longer active." }, { status: 409 });
  if (assignment.currentStatus !== "standby") return NextResponse.json({ error: "Passenger verification is available only while standing by." }, { status: 409 });
  if (assignment.passengerVerifiedAt) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE booking_assignments SET current_status = 'passenger_verified', updated_at = ? WHERE id = ? AND current_status = 'standby'`).bind(new Date().toISOString(), assignment.id),
      env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'passenger_verified', ?, ?)`).bind(booking.reference, `passenger-verification-upgrade:${assignment.id}`, assignment.passengerVerifiedAt),
    ]);
    return NextResponse.json({ ok: true, verifiedAt: assignment.passengerVerifiedAt, attemptsRemaining: MAX_ATTEMPTS });
  }
  const pin = String(input.pin ?? "").trim();
  const latitude = Number(input.latitude), longitude = Number(input.longitude), accuracy = Math.round(Number(input.accuracy));
  const locationValid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 2_000;
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "Enter the passenger’s 4-digit Trip PIN." }, { status: 400 });
  if (!locationValid) return NextResponse.json({ error: "Allow location access before verifying the passenger." }, { status: 400 });
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(passengerVerifications).where(and(eq(passengerVerifications.assignmentId, assignment.id), eq(passengerVerifications.result, "failed")));
  if (attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: "Too many failed attempts. Contact Waydidi operations.", attemptsRemaining: 0 }, { status: 429 });
  const expected = booking.tripPinHash ?? await tripPinHash(booking.reference, await tripPinForReference(booking.reference));
  const supplied = await tripPinHash(booking.reference, pin);
  const now = new Date().toISOString();
  const attemptNumber = attempts + 1;
  if (!constantTimeEqual(expected, supplied)) {
    const verificationId = crypto.randomUUID();
    const statements = [env.DB.prepare(`INSERT INTO passenger_verifications (id, booking_reference, assignment_id, driver_id, result, attempt_number, latitude, longitude, accuracy_metres, actor, created_at) VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, ?, 'driver', ?)`).bind(verificationId, booking.reference, assignment.id, assignment.driverId, attemptNumber, latitude, longitude, accuracy, now)];
    if (attemptNumber >= 3) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO operations_alerts (id, booking_reference, assignment_id, alert_type, severity, title, details, dedupe_key, status, detected_at, created_at, updated_at) VALUES (?, ?, ?, 'passenger_pin_failed', ?, 'Passenger PIN needs attention', ?, ?, 'open', ?, ?, ?)`).bind(crypto.randomUUID(), booking.reference, assignment.id, attemptNumber >= MAX_ATTEMPTS ? "critical" : "warning", `${attemptNumber} failed PIN attempts. Call the passenger or driver.`, `passenger-pin:${assignment.id}`, now, now, now));
    await env.DB.batch(statements);
    return NextResponse.json({ error: attemptNumber >= MAX_ATTEMPTS ? "Too many failed attempts. Contact Waydidi operations." : "That PIN does not match. Ask the passenger to check their confirmation.", attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attemptNumber) }, { status: attemptNumber >= MAX_ATTEMPTS ? 429 : 401 });
  }
  const verificationId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO passenger_verifications (id, booking_reference, assignment_id, driver_id, result, attempt_number, latitude, longitude, accuracy_metres, actor, created_at) VALUES (?, ?, ?, ?, 'verified', ?, ?, ?, ?, 'driver', ?)`).bind(verificationId, booking.reference, assignment.id, assignment.driverId, attemptNumber, latitude, longitude, accuracy, now),
    env.DB.prepare(`UPDATE booking_assignments SET current_status = 'passenger_verified', passenger_verified_at = ?, passenger_verification_method = 'trip_pin', passenger_verified_by = 'driver', updated_at = ? WHERE id = ? AND current_status = 'standby' AND passenger_verified_at IS NULL`).bind(now, now, assignment.id),
    env.DB.prepare(`INSERT INTO driver_status_events (id, assignment_id, booking_reference, status, previous_status, latitude, longitude, accuracy_metres, verification_status, created_at) VALUES (?, ?, ?, 'passenger_verified', 'standby', ?, ?, ?, 'verified', ?)`).bind(crypto.randomUUID(), assignment.id, booking.reference, latitude, longitude, accuracy, now),
    env.DB.prepare(`INSERT INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'passenger_verified', ?, ?)`).bind(booking.reference, `passenger-verification:${verificationId}`, now),
  ]);
  return NextResponse.json({ ok: true, verifiedAt: now, attemptsRemaining: MAX_ATTEMPTS - attempts });
}

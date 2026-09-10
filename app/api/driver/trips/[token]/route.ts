import { env } from "cloudflare:workers";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookings, drivers, driverStatusEvents } from "@/db/schema";
import { activeAssignmentForToken, distanceMetres, evidenceRequired, isDriverStatus, NEXT_DRIVER_STATUS } from "@/lib/driver-operations";
import { sameOrigin, sha256Bytes } from "@/lib/security";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validImage(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function tripForToken(token: string) {
  const assignment = await activeAssignmentForToken(token);
  if (!assignment) return null;
  const [[booking], [driver], events] = await Promise.all([
    getDb().select().from(bookings).where(eq(bookings.reference, assignment.bookingReference)).limit(1),
    getDb().select().from(drivers).where(eq(drivers.id, assignment.driverId)).limit(1),
    getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.assignmentId, assignment.id)).orderBy(desc(driverStatusEvents.createdAt)),
  ]);
  if (!booking || !driver) return null;
  return { assignment, booking, driver, events };
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trip = await tripForToken(token);
  if (!trip) return NextResponse.json({ error: "This driver link is invalid, expired, or revoked." }, { status: 404 });
  const { assignment, booking, driver, events } = trip;
  return NextResponse.json({
    assignment: { id: assignment.id, currentStatus: assignment.currentStatus, tokenExpiresAt: assignment.tokenExpiresAt },
    driver: { fullName: driver.fullName, phone: driver.phone },
    booking: {
      reference: booking.reference, customerName: booking.customerName, customerPhone: booking.customerPhone,
      pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime,
      passengers: booking.passengers, luggage: booking.luggage, vehicle: booking.vehicle, flightNumber: booking.flightNumber,
      pickupLatitude: booking.pickupLatitude, pickupLongitude: booking.pickupLongitude,
      dropoffLatitude: booking.dropoffLatitude, dropoffLongitude: booking.dropoffLongitude,
      status: booking.status,
    },
    events: events.map(({ evidenceKey, evidenceSha256, ...event }) => ({ ...event, hasEvidence: Boolean(evidenceKey || evidenceSha256) })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const { token } = await context.params;
  const trip = await tripForToken(token);
  if (!trip) return NextResponse.json({ error: "This driver link is invalid, expired, or revoked." }, { status: 404 });
  if (trip.booking.status !== "confirmed") return NextResponse.json({ error: "This booking is no longer active." }, { status: 409 });
  const current = trip.assignment.currentStatus;
  if (!isDriverStatus(current)) return NextResponse.json({ error: "Current status is invalid." }, { status: 409 });

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(driverStatusEvents).where(and(eq(driverStatusEvents.assignmentId, trip.assignment.id), gt(driverStatusEvents.createdAt, since)));
  if (attempts >= 10) return NextResponse.json({ error: "Too many updates. Wait a few minutes and try again." }, { status: 429 });

  const form = await request.formData();
  const requestedStatus = String(form.get("status") ?? "");
  if (!isDriverStatus(requestedStatus) || NEXT_DRIVER_STATUS[current] !== requestedStatus) return NextResponse.json({ error: "Complete the trip steps in order." }, { status: 409 });
  const note = String(form.get("note") ?? "").trim();
  if (note.length > 500) return NextResponse.json({ error: "The note is too long." }, { status: 400 });

  const needsEvidence = evidenceRequired(requestedStatus);
  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  const accuracy = Math.round(Number(form.get("accuracy")));
  const coordinatesValid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 2_000;
  if (needsEvidence && !coordinatesValid) return NextResponse.json({ error: "Allow location access and capture your current position before submitting." }, { status: 400 });

  let expectedDistance: number | null = null;
  if (coordinatesValid) {
    const target = requestedStatus === "completed"
      ? { latitude: trip.booking.dropoffLatitude, longitude: trip.booking.dropoffLongitude }
      : { latitude: trip.booking.pickupLatitude, longitude: trip.booking.pickupLongitude };
    if (target.latitude != null && target.longitude != null) expectedDistance = distanceMetres({ latitude, longitude }, { latitude: target.latitude, longitude: target.longitude });
  }

  let evidenceKey: string | null = null;
  let evidenceMime: string | null = null;
  let evidenceBytes: number | null = null;
  let evidenceSha256: string | null = null;
  const evidence = form.get("evidence");
  if (needsEvidence) {
    if (!(evidence instanceof File) || !evidence.size) return NextResponse.json({ error: "Take or choose a picture before submitting." }, { status: 400 });
    if (evidence.size > MAX_PHOTO_BYTES || !ACCEPTED_TYPES.has(evidence.type)) return NextResponse.json({ error: "Use a JPG, PNG, or WebP picture smaller than 8 MB." }, { status: 400 });
    const bytes = new Uint8Array(await evidence.arrayBuffer());
    if (!validImage(bytes, evidence.type)) return NextResponse.json({ error: "The selected file is not a valid picture." }, { status: 400 });
    if (!env.BUCKET) return NextResponse.json({ error: "Picture storage is temporarily unavailable." }, { status: 503 });
    const extension = evidence.type === "image/jpeg" ? "jpg" : evidence.type === "image/png" ? "png" : "webp";
    evidenceKey = `driver-evidence/${trip.booking.reference}/${requestedStatus}/${crypto.randomUUID()}.${extension}`;
    evidenceMime = evidence.type;
    evidenceBytes = evidence.size;
    evidenceSha256 = await sha256Bytes(bytes);
    await env.BUCKET.put(evidenceKey, bytes, { httpMetadata: { contentType: evidence.type, cacheControl: "private, no-store" }, customMetadata: { booking: trip.booking.reference, assignment: trip.assignment.id, status: requestedStatus } });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO driver_status_events (id, assignment_id, booking_reference, status, previous_status, latitude, longitude, accuracy_metres, expected_distance_metres, driver_note, evidence_key, evidence_mime, evidence_bytes, evidence_sha256, verification_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, trip.assignment.id, trip.booking.reference, requestedStatus, current, coordinatesValid ? latitude : null, coordinatesValid ? longitude : null, coordinatesValid ? accuracy : null, expectedDistance, note || null, evidenceKey, evidenceMime, evidenceBytes, evidenceSha256, needsEvidence ? "pending_review" : "not_required", now),
      env.DB.prepare(`UPDATE booking_assignments SET current_status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND current_status = ? AND revoked_at IS NULL`).bind(requestedStatus, requestedStatus === "completed" ? now : null, now, trip.assignment.id, current),
    ]);
  } catch (error) {
    if (evidenceKey && env.BUCKET) await env.BUCKET.delete(evidenceKey).catch(() => undefined);
    console.error("Driver status update failed", error);
    return NextResponse.json({ error: "The update could not be saved. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, status: requestedStatus, eventId: id, expectedDistanceMetres: expectedDistance });
}

import { evidenceDb, evidencePolicy, evidenceOverride, type EvidenceRow } from "@/lib/trip-evidence";
import { evidenceTypeFor, type EvidencePolicy } from "@/lib/evidence-rules";
import { journeyFor, parseLeg } from "@/lib/journey-legs";
import { env } from "cloudflare:workers";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { deleteFile, putFile } from "@/lib/file-store";
import { getDb } from "@/db";
import { bookings, drivers, driverPayoutDetails, driverStatusEvents, journeyExceptions, journeyStopDeclarations, passengerVerifications } from "@/db/schema";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { acceptedOccurredAt, adminReviewRequired, AIRPORT_FREE_WAIT_MINUTES, distanceMetres, evidenceRequired, expectedPointFor, isAirportPickup, isDriverStatus, locationRequired, NEXT_DRIVER_STATUS, NO_SHOW_MAX_DISTANCE_METRES, NO_SHOW_MIN_NOTE_LENGTH, noShowEligibleAt, STANDARD_FREE_WAIT_MINUTES, TRIP_START_WARNING_METRES, type DriverStatus } from "@/lib/trip-rules";
import { sameOrigin, sha256Bytes } from "@/lib/security";
import { notifyLineTripStatus } from "@/lib/line";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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
  const journey = await journeyFor(booking,parseLeg(assignment.leg));
  if (!journey) return null;
  return { assignment, booking: journey, driver, events };
}

function eligibleAtIso(booking: typeof bookings.$inferSelect) {
  const eligibleAt = noShowEligibleAt(booking);
  return eligibleAt === null ? null : new Date(eligibleAt).toISOString();
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trip = await tripForToken(token);
  if (!trip) return NextResponse.json({ error: "This driver link is invalid, expired, or revoked." }, { status: 404 });
  const { assignment, booking, driver, events } = trip;
  const [[{ failedAttempts }], [activeStop], [payout], [openStopAlert]] = await Promise.all([
    getDb().select({ failedAttempts: count() }).from(passengerVerifications).where(and(eq(passengerVerifications.assignmentId, assignment.id), eq(passengerVerifications.result, "failed"))),
    getDb().select().from(journeyStopDeclarations).where(and(eq(journeyStopDeclarations.assignmentId, assignment.id), isNull(journeyStopDeclarations.clearedAt))).orderBy(desc(journeyStopDeclarations.declaredAt)).limit(1),
    getDb().select().from(driverPayoutDetails).where(eq(driverPayoutDetails.assignmentId, assignment.id)).limit(1),
    getDb().select({ id: journeyExceptions.id }).from(journeyExceptions).where(and(eq(journeyExceptions.assignmentId, assignment.id), eq(journeyExceptions.exceptionType, "abnormal_stop"), eq(journeyExceptions.status, "open"))).limit(1).catch(() => []),
  ]);
  // Google Maps links set by an admin in Telegram (outbound pickup/drop-off; swapped for the return).
  const maps = (await env.DB.prepare("SELECT pickup_map_url,dropoff_map_url FROM booking_map_links WHERE booking_reference=?").bind(booking.reference).first().catch(() => null)) as { pickup_map_url: string | null; dropoff_map_url: string | null } | null;
  const pickupMapUrl = (assignment.leg === "return" ? maps?.dropoff_map_url : maps?.pickup_map_url) ?? null;
  const dropoffMapUrl = (assignment.leg === "return" ? maps?.pickup_map_url : maps?.dropoff_map_url) ?? null;
  // The price for this trip: what staff typed with "Set cost" on the Telegram booking card (null until then).
  const cost = (await env.DB.prepare("SELECT total_driver_cost FROM booking_costs WHERE booking_reference=?").bind(booking.reference).first().catch(() => null)) as { total_driver_cost: number | null } | null;
  return NextResponse.json({
    // Viewing the trip never fails on the photo settings (status changes still enforce them).
    evidencePolicy: await evidencePolicy().catch((): EvidencePolicy => ({ pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 20000, max_accuracy_m: 2000, retention_days: 30 })),
    evidenceOverrides: { pickup: Boolean(await evidenceOverride(assignment.id,"pickup").catch(() => null)), dropoff: Boolean(await evidenceOverride(assignment.id,"dropoff").catch(() => null)) },
    assignment: { id: assignment.id, currentStatus: assignment.currentStatus === "standby" && assignment.passengerVerifiedAt ? "passenger_verified" : assignment.currentStatus, tokenExpiresAt: assignment.tokenExpiresAt, passengerVerifiedAt: assignment.passengerVerifiedAt, passengerVerificationMethod: assignment.passengerVerificationMethod, passengerVerificationAttemptsRemaining: Math.max(0, 5 - failedAttempts) },
    driver: { fullName: driver.fullName, phone: driver.phone },
    booking: {
      leg: booking.leg, reference: booking.reference, customerName: booking.customerName, customerPhone: booking.customerPhone,
      pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime,
      passengers: booking.passengers, luggage: booking.luggage, vehicle: booking.vehicle, flightNumber: booking.flightNumber,
      pickupLatitude: booking.pickupLatitude, pickupLongitude: booking.pickupLongitude,
      dropoffLatitude: booking.dropoffLatitude, dropoffLongitude: booking.dropoffLongitude,
      status: booking.status, pickupMapUrl, dropoffMapUrl,
      price: cost?.total_driver_cost ?? null, paymentStatus: booking.paymentStatus,
    },
    events: events.map(({ evidenceKey, evidenceSha256, ...event }) => ({ ...event, hasEvidence: Boolean(evidenceKey || evidenceSha256 || event.tripEvidenceId) })),
    activeStop: activeStop ? { reason: activeStop.reason, note: activeStop.note, declaredAt: activeStop.declaredAt } : null,
    // The car has been still long enough for an operations alert: the page asks the driver why.
    stopAlert: Boolean(openStopAlert) && !activeStop,
    noShow: { eligibleAt: eligibleAtIso(booking), airport: isAirportPickup(booking), freeWaitMinutes: isAirportPickup(booking) ? AIRPORT_FREE_WAIT_MINUTES : STANDARD_FREE_WAIT_MINUTES, maxDistanceMetres: NO_SHOW_MAX_DISTANCE_METRES },
    payoutDetails: payout ? { submittedAt: payout.submittedAt } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const { token } = await context.params;
  const trip = await tripForToken(token);
  if (!trip) return NextResponse.json({ error: "This driver link is invalid, expired, or revoked." }, { status: 404 });
  // Replay is checked before status validation so a lost completion response remains recoverable.
  if (Number(request.headers.get("content-length")??0)>9*1024*1024) return NextResponse.json({error:"Upload too large"},{status:413});
  const form = await request.formData();
  const replayId=String(form.get("clientEventId")??"").toLowerCase();
  const replay=trip.events.find(event=>event.id===replayId);
  if(replay) return replay.status===String(form.get("status")) ? NextResponse.json({ok:true,status:replay.status,eventId:replay.id,duplicate:true}) : NextResponse.json({error:"Update id already used"},{status:409});
  if (trip.booking.status !== "confirmed") return NextResponse.json({ error: "This booking is no longer active." }, { status: 409 });
  const storedCurrent = trip.assignment.currentStatus;
  const current = storedCurrent === "standby" && trip.assignment.passengerVerifiedAt ? "passenger_verified" : storedCurrent;
  if (!isDriverStatus(current)) return NextResponse.json({ error: "Current status is invalid." }, { status: 409 });

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(driverStatusEvents).where(and(eq(driverStatusEvents.assignmentId, trip.assignment.id), gt(driverStatusEvents.createdAt, since)));
  if (attempts >= 10) return NextResponse.json({ error: "Too many updates. Wait a few minutes and try again." }, { status: 429 });

  const requestedStatus = String(form.get("status") ?? "");
  const clientEventId = String(form.get("clientEventId") ?? "").toLowerCase();
  if (clientEventId && !UUID_PATTERN.test(clientEventId)) return NextResponse.json({ error: "Invalid update id." }, { status: 400 });
  // A queued offline update may be re-sent after the first attempt was saved.
  if (clientEventId && trip.events.some((event) => event.id === clientEventId)) return NextResponse.json({ ok: true, status: requestedStatus, eventId: clientEventId, duplicate: true });
  if (!isDriverStatus(requestedStatus)) return NextResponse.json({ error: "Complete the trip steps in order." }, { status: 409 });
  const noShow = requestedStatus === "no_show";
  if (noShow ? current !== "standby" : NEXT_DRIVER_STATUS[current] !== requestedStatus) return NextResponse.json({ error: noShow ? "A no-show can only be reported while waiting at pickup." : "Complete the trip steps in order." }, { status: 409 });
  const note = String(form.get("note") ?? "").trim();
  if (note.length > 500) return NextResponse.json({ error: "The note is too long." }, { status: 400 });
  if (noShow && note.length < NO_SHOW_MIN_NOTE_LENGTH) return NextResponse.json({ error: "Describe how you tried to find the passenger." }, { status: 400 });

  const nowMs = Date.now();
  const lastEventAt = trip.events[0] ? new Date(trip.events[0].createdAt).getTime() : null;
  const occurredAt = acceptedOccurredAt(form.get("occurredAt"), nowMs, lastEventAt);
  if (!occurredAt) return NextResponse.json({ error: "This update is too old or out of order. Refresh the page and try again." }, { status: 409 });
  if (noShow) {
    const eligibleAt = noShowEligibleAt(trip.booking);
    if (eligibleAt === null || new Date(occurredAt).getTime() < eligibleAt) return NextResponse.json({ error: "The free waiting time is not over yet.", eligibleAt: eligibleAt === null ? null : new Date(eligibleAt).toISOString() }, { status: 409 });
  }

  const type = evidenceTypeFor(requestedStatus);
  const policy = await evidencePolicy();
  const override = type ? await evidenceOverride(trip.assignment.id,type) : null;
  const evidenceId = String(form.get("evidenceId")??"") || null;
  const storedEvidence = evidenceId ? await evidenceDb().prepare("SELECT * FROM driver_trip_evidence WHERE id=? AND assignment_id=? AND deleted_at IS NULL AND expires_at>?").bind(evidenceId,trip.assignment.id,new Date().toISOString()).first<EvidenceRow>() : null;
  if(evidenceId && (!storedEvidence || storedEvidence.event_type!==type || storedEvidence.status_event_id)) return NextResponse.json({error:"Photo does not match this trip step. Refresh and retry."},{status:409});
  const required = requestedStatus === "standby" ? policy.pickup_required : requestedStatus === "completed" ? policy.dropoff_required : 0;
  if(required && !storedEvidence && !override) return NextResponse.json({error:"Save a photo first, or contact operations for an audited exception."},{status:409});
  if(storedEvidence && policy.gps_required && !override && (storedEvidence.latitude===null || storedEvidence.accuracy_metres===null || storedEvidence.accuracy_metres>policy.max_accuracy_m)) return NextResponse.json({error:"Photo GPS is unavailable or inaccurate. Retake with GPS, or contact operations."},{status:409});
  const needsEvidence = requestedStatus === "no_show" && evidenceRequired(requestedStatus);
  // Evidence GPS is optional by default; existing tracking requirements on other steps remain.
  const needsLocation = locationRequired(requestedStatus);
  const latitude = form.has("latitude") ? Number(form.get("latitude")) : NaN;
  const longitude = form.has("longitude") ? Number(form.get("longitude")) : NaN;
  const accuracy = Math.round(Number(form.get("accuracy")));
  const coordinatesValid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 2_000;
  if (needsLocation && !coordinatesValid) return NextResponse.json({ error: "Allow location access and capture your current position before submitting." }, { status: 400 });

  let expectedDistance: number | null = null;
  if (coordinatesValid) {
    const point = expectedPointFor(requestedStatus);
    const target = point === "dropoff"
      ? { latitude: trip.booking.dropoffLatitude, longitude: trip.booking.dropoffLongitude }
      : point === "pickup"
        ? { latitude: trip.booking.pickupLatitude, longitude: trip.booking.pickupLongitude }
        : null;
    if (target?.latitude != null && target.longitude != null) expectedDistance = distanceMetres({ latitude, longitude }, { latitude: target.latitude, longitude: target.longitude });
  }
  if (noShow && expectedDistance !== null && expectedDistance > NO_SHOW_MAX_DISTANCE_METRES) return NextResponse.json({ error: `You must be within ${NO_SHOW_MAX_DISTANCE_METRES / 1000} km of the pickup point to report a no-show. You are about ${(expectedDistance / 1000).toFixed(1)} km away.` }, { status: 409 });

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
    const extension = evidence.type === "image/jpeg" ? "jpg" : evidence.type === "image/png" ? "png" : "webp";
    evidenceKey = `driver-evidence/${trip.booking.reference}/${requestedStatus}/${crypto.randomUUID()}.${extension}`;
    evidenceMime = evidence.type;
    evidenceBytes = evidence.size;
    evidenceSha256 = await sha256Bytes(bytes);
    await putFile(evidenceKey, bytes, evidence.type);
  }

  const id = clientEventId || crypto.randomUUID();
  const now = new Date(nowMs).toISOString();
  const final = requestedStatus === "completed" || noShow;
  const statements = [
    env.DB.prepare(`INSERT INTO driver_status_events (id, assignment_id, booking_reference, status, previous_status, latitude, longitude, accuracy_metres, expected_distance_metres, driver_note, evidence_key, evidence_mime, evidence_bytes, evidence_sha256, verification_status, created_at, trip_evidence_id, confirmed_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM booking_assignments WHERE id = ? AND current_status = ? AND revoked_at IS NULL`).bind(id, trip.assignment.id, trip.booking.reference, requestedStatus, current, coordinatesValid ? latitude : null, coordinatesValid ? longitude : null, coordinatesValid ? accuracy : null, expectedDistance, note || null, evidenceKey, evidenceMime, evidenceBytes, evidenceSha256, adminReviewRequired(requestedStatus) ? "pending_review" : "not_required", occurredAt, evidenceId, now, trip.assignment.id, storedCurrent),
    env.DB.prepare(`UPDATE booking_assignments SET current_status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND current_status = ? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM driver_status_events WHERE id = ? AND assignment_id = ?)`).bind(requestedStatus, final ? now : null, now, trip.assignment.id, storedCurrent, id, trip.assignment.id),
  ];
  if (occurredAt !== now) {
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) SELECT ?, 'driver_status_sent_late', ?, ? WHERE EXISTS(SELECT 1 FROM driver_status_events WHERE id = ?)`).bind(trip.booking.reference, `driver-status-late:${id}`, now, id));
  }
  const alerts: Array<{ type: string; severity: "warning" | "critical"; title: string; details: string }> = [];
  if (noShow) {
    alerts.push({ type: "passenger_no_show", severity: "critical", title: "Passenger no-show reported", details: `Driver reported a no-show${expectedDistance !== null ? ` ${expectedDistance} m from pickup` : ""}. Review the photo and note, contact the passenger, then approve or reject. Note: ${note}` });
    statements.push(env.DB.prepare(`UPDATE bookings SET attention_status = 'attention', attention_reason = ?, updated_at = ? WHERE reference = ? AND EXISTS(SELECT 1 FROM driver_status_events WHERE id = ?)`).bind("Driver reported a passenger no-show. Review the evidence and decide any charge.", now, trip.booking.reference, id));
  }
  if (requestedStatus === "trip_started" && expectedDistance !== null && expectedDistance > TRIP_START_WARNING_METRES) {
    alerts.push({ type: "trip_started_away", severity: "warning", title: "Trip started away from pickup", details: `The driver started the trip about ${(expectedDistance / 1000).toFixed(1)} km from the booked pickup point.` });
  }
  for (const alert of alerts) {
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO operations_alerts (id, booking_reference, assignment_id, alert_type, severity, title, details, dedupe_key, status, detected_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ? WHERE EXISTS(SELECT 1 FROM driver_status_events WHERE id = ?)`).bind(crypto.randomUUID(), trip.booking.reference, trip.assignment.id, alert.type, alert.severity, alert.title, alert.details, `${alert.type}:${trip.assignment.id}`, now, now, now, id));
  }
  try {
    const result = await env.DB.batch(statements);
    if (!result[0].meta.changes || !result[1].meta.changes) {
      if (evidenceKey) await deleteFile(evidenceKey).catch(() => undefined);
      const duplicate = await evidenceDb().prepare("SELECT status FROM driver_status_events WHERE id=? AND assignment_id=?").bind(id,trip.assignment.id).first<{status:string}>();
      if(duplicate?.status===requestedStatus) return NextResponse.json({ok:true,status:requestedStatus,eventId:id,duplicate:true});
      return NextResponse.json({error:"The journey changed while this update was uploading. Refresh and retry."},{status:409});
    }
  } catch (error) {
    if (evidenceKey) await deleteFile(evidenceKey).catch(() => undefined);
    void error;
    const duplicate = await evidenceDb().prepare("SELECT status FROM driver_status_events WHERE id=? AND assignment_id=?").bind(id,trip.assignment.id).first<{status:string}>();
    if(duplicate?.status===requestedStatus) return NextResponse.json({ok:true,status:requestedStatus,eventId:id,duplicate:true});
    return NextResponse.json({ error: "The update could not be saved. Please try again." }, { status: 503 });
  }
  if (!type) await notifyLineTripStatus({
    eventId: id,
    reference: trip.booking.reference,
    driverName: trip.driver.fullName,
    customerName: trip.booking.customerName,
    pickup: trip.booking.pickup,
    dropoff: trip.booking.dropoff,
    pickupDate: trip.booking.pickupDate,
    pickupTime: trip.booking.pickupTime,
    vehicle: trip.booking.vehicle,
    detail: lineDetail(requestedStatus, { note, expectedDistance, occurredAt, now }),
  }, requestedStatus as Exclude<DriverStatus, "assigned" | "passenger_verified" | "passenger_picked_up">).catch((error) => console.error("LINE trip notification failed", error));
  return NextResponse.json({ ok: true, status: requestedStatus, eventId: id, expectedDistanceMetres: expectedDistance });
}

function lineDetail(status: DriverStatus, input: { note: string; expectedDistance: number | null; occurredAt: string; now: string }) {
  const parts: string[] = [];
  if (input.expectedDistance !== null) parts.push(`ห่างจากจุดที่กำหนด: ${input.expectedDistance >= 1000 ? `${(input.expectedDistance / 1000).toFixed(1)} กม.` : `${input.expectedDistance} ม.`}`);
  if (input.occurredAt !== input.now) parts.push(`ส่งช้า (ออฟไลน์) · เวลาจริง ${new Date(input.occurredAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}`);
  if (status === "no_show" && input.note) parts.push(`หมายเหตุคนขับ: ${input.note}`);
  return parts.join("\n") || undefined;
}

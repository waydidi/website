import { env } from "cloudflare:workers";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookings, journeyExceptions, journeyLocations, journeyStopDeclarations } from "@/db/schema";
import { activeAssignmentForToken, distanceMetres as pointDistanceMetres } from "@/lib/driver-operations";
import { decodePolyline, distanceToRouteMetres } from "@/lib/route-deviation";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const RETENTION_DAYS = 90;

function configuredNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

async function expectedPolyline(booking: typeof bookings.$inferSelect) {
  if (booking.expectedRoutePolyline) return booking.expectedRoutePolyline;
  if (!env.GOOGLE_MAPS_SERVER_KEY || booking.pickupLatitude == null || booking.pickupLongitude == null || booking.dropoffLatitude == null || booking.dropoffLongitude == null) return null;
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY, "X-Goog-FieldMask": "routes.polyline.encodedPolyline" }, body: JSON.stringify({ origin: { location: { latLng: { latitude: booking.pickupLatitude, longitude: booking.pickupLongitude } } }, destination: { location: { latLng: { latitude: booking.dropoffLatitude, longitude: booking.dropoffLongitude } } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" }) });
  if (!response.ok) return null;
  const data = await response.json() as { routes?: Array<{ polyline?: { encodedPolyline?: string } }> };
  const polyline = data.routes?.[0]?.polyline?.encodedPolyline ?? null;
  if (polyline) await getDb().update(bookings).set({ expectedRoutePolyline: polyline, updatedAt: new Date().toISOString() }).where(eq(bookings.reference, booking.reference));
  return polyline;
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json() as { token?: string; latitude?: number; longitude?: number; accuracyMetres?: number; clientTimestamp?: string; sequenceNumber?: number };
  const assignment = await activeAssignmentForToken(input.token ?? "");
  if (!assignment) return NextResponse.json({ error: "Driver session unavailable." }, { status: 404 });
  // Shared with the customer from "On the way"; route and stop checks only apply once the passenger is aboard.
  if (!["going_to_standby", "trip_started", "passenger_picked_up"].includes(assignment.currentStatus)) return NextResponse.json({ error: "Live tracking is not active for this journey." }, { status: 409 });
  const onTrip = assignment.currentStatus !== "going_to_standby";
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, assignment.bookingReference)).limit(1);
  if (!booking || booking.status !== "confirmed") return NextResponse.json({ error: "This journey is no longer active." }, { status: 409 });
  const latitude = Number(input.latitude), longitude = Number(input.longitude), accuracy = Math.round(Number(input.accuracyMetres));
  const sequence = Math.floor(Number(input.sequenceNumber));
  const clientTime = new Date(String(input.clientTimestamp ?? ""));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 2_000) return NextResponse.json({ error: "GPS accuracy is too poor." }, { status: 400 });
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 2_000_000_000) return NextResponse.json({ error: "Invalid tracking sequence." }, { status: 400 });
  if (!Number.isFinite(clientTime.getTime()) || Math.abs(Date.now() - clientTime.getTime()) > 10 * 60 * 1000) return NextResponse.json({ error: "Location timestamp is outside the accepted window." }, { status: 400 });
  const now = new Date();
  const serverTimestamp = now.toISOString();
  const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const quality = accuracy <= 200 ? "good" : "weak";
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO journey_locations (id, booking_reference, assignment_id, driver_id, latitude, longitude, accuracy_metres, client_timestamp, server_timestamp, sequence_number, quality, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), assignment.bookingReference, assignment.id, assignment.driverId, latitude, longitude, accuracy, clientTime.toISOString(), serverTimestamp, sequence, quality, purgeAfter).run();
  let deviation: { status: string; distanceMetres: number; corridorMetres: number } | null = null;
  if (onTrip && (result.meta.changes ?? 0) > 0 && quality === "good") {
    const encoded = await expectedPolyline(booking).catch(() => null);
    if (encoded) {
      const route = decodePolyline(encoded);
      const distanceMetres = distanceToRouteMetres({ latitude, longitude }, route);
      const longThreshold = configuredNumber(env.WAYDIDI_ROUTE_LONG_DISTANCE_METRES, 150_000, 20_000, 1_000_000);
      const corridorMetres = (booking.routeDistanceMeters ?? 0) >= longThreshold
        ? configuredNumber(env.WAYDIDI_ROUTE_CORRIDOR_LONG_METRES, 4_000, 500, 20_000)
        : configuredNumber(env.WAYDIDI_ROUTE_CORRIDOR_URBAN_METRES, 1_500, 250, 10_000);
      const requiredPoints = configuredNumber(env.WAYDIDI_ROUTE_DEVIATION_POINTS, 4, 2, 10);
      const requiredMinutes = configuredNumber(env.WAYDIDI_ROUTE_DEVIATION_MINUTES, 2, 1, 30);
      const recent = await getDb().select().from(journeyLocations).where(eq(journeyLocations.assignmentId, assignment.id)).orderBy(desc(journeyLocations.serverTimestamp)).limit(requiredPoints);
      const distances = recent.filter((point) => point.accuracyMetres <= 200).map((point) => ({ point, distance: distanceToRouteMetres({ latitude: point.latitude, longitude: point.longitude }, route) }));
      const [activeException] = await getDb().select().from(journeyExceptions).where(and(eq(journeyExceptions.assignmentId, assignment.id), eq(journeyExceptions.exceptionType, "route_deviation"), eq(journeyExceptions.status, "open"))).limit(1);
      if (distanceMetres <= corridorMetres && activeException) {
        await env.DB.batch([
          env.DB.prepare(`UPDATE journey_exceptions SET status = 'resolved', distance_metres = ?, last_seen_at = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'open'`).bind(distanceMetres, serverTimestamp, serverTimestamp, serverTimestamp, activeException.id),
          env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'route_deviation_resolved', ?, ?)`).bind(booking.reference, `route-deviation-resolved:${activeException.id}`, serverTimestamp),
        ]);
        deviation = { status: "resolved", distanceMetres, corridorMetres };
      } else if (distanceMetres > corridorMetres) {
        const sustained = distances.length === requiredPoints && distances.every((item) => item.distance > corridorMetres) && new Date(distances[0].point.serverTimestamp).getTime() - new Date(distances[distances.length - 1].point.serverTimestamp).getTime() >= requiredMinutes * 60_000;
        if (activeException) {
          await getDb().update(journeyExceptions).set({ distanceMetres, consecutivePoints: Math.max(activeException.consecutivePoints, distances.length), lastSeenAt: serverTimestamp, updatedAt: serverTimestamp }).where(eq(journeyExceptions.id, activeException.id));
          deviation = { status: "open", distanceMetres, corridorMetres };
        } else if (sustained) {
          const exceptionId = crypto.randomUUID();
          const startedAt = distances[distances.length - 1].point.serverTimestamp;
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO journey_exceptions (id, booking_reference, assignment_id, exception_type, status, severity, distance_metres, corridor_metres, consecutive_points, started_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'route_deviation', 'open', 'warning', ?, ?, ?, ?, ?, ?, ?)`).bind(exceptionId, booking.reference, assignment.id, distanceMetres, corridorMetres, requiredPoints, startedAt, serverTimestamp, serverTimestamp, serverTimestamp),
            env.DB.prepare(`INSERT INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'route_deviation_started', ?, ?)`).bind(booking.reference, `route-deviation-started:${exceptionId}`, serverTimestamp),
          ]);
          deviation = { status: "open", distanceMetres, corridorMetres };
        } else deviation = { status: "potential", distanceMetres, corridorMetres };
      }
    }
  }
  let abnormalStop: { status: string; durationSeconds: number; reason?: string } | null = null;
  if (onTrip && (result.meta.changes ?? 0) > 0 && quality === "good") {
    const stopRadiusMetres = configuredNumber(env.WAYDIDI_STOP_RADIUS_METRES, 100, 30, 500);
    const minimumPoints = configuredNumber(env.WAYDIDI_STOP_MIN_POINTS, 8, 4, 40);
    const baseMinutes = booking.serviceType === "hourly"
      ? configuredNumber(env.WAYDIDI_STOP_HOURLY_MINUTES, 30, 10, 120)
      : configuredNumber(env.WAYDIDI_STOP_TRANSFER_MINUTES, 20, 10, 120);
    const deviationMinutes = configuredNumber(env.WAYDIDI_STOP_ROUTE_DEVIATION_MINUTES, 15, 10, 120);
    const minimumRemainingMetres = configuredNumber(env.WAYDIDI_STOP_MIN_REMAINING_METRES, 2_000, 0, 20_000);
    const resumeMetres = configuredNumber(env.WAYDIDI_STOP_RESUME_METRES, 200, 50, 2_000);
    const resumePoints = configuredNumber(env.WAYDIDI_STOP_RESUME_POINTS, 3, 2, 8);
    const recent = (await getDb().select().from(journeyLocations).where(eq(journeyLocations.assignmentId, assignment.id)).orderBy(desc(journeyLocations.serverTimestamp)).limit(80)).filter((point) => point.accuracyMetres <= 200);
    const newest = recent[0];
    const stationary: typeof recent = [];
    if (newest) {
      for (const point of recent) {
        if (pointDistanceMetres({ latitude: newest.latitude, longitude: newest.longitude }, { latitude: point.latitude, longitude: point.longitude }) > stopRadiusMetres) break;
        stationary.push(point);
      }
    }
    const durationSeconds = stationary.length > 1
      ? Math.max(0, Math.round((new Date(stationary[0].serverTimestamp).getTime() - new Date(stationary[stationary.length - 1].serverTimestamp).getTime()) / 1000))
      : 0;
    const resumeWindow = recent.slice(0, resumePoints);
    const resumed = resumeWindow.length === resumePoints && pointDistanceMetres(
      { latitude: resumeWindow[0].latitude, longitude: resumeWindow[0].longitude },
      { latitude: resumeWindow[resumeWindow.length - 1].latitude, longitude: resumeWindow[resumeWindow.length - 1].longitude },
    ) >= resumeMetres;
    const [[activeStopException], [declaredStop], [activeDeviation]] = await Promise.all([
      getDb().select().from(journeyExceptions).where(and(eq(journeyExceptions.assignmentId, assignment.id), eq(journeyExceptions.exceptionType, "abnormal_stop"), eq(journeyExceptions.status, "open"))).limit(1),
      getDb().select().from(journeyStopDeclarations).where(and(eq(journeyStopDeclarations.assignmentId, assignment.id), isNull(journeyStopDeclarations.clearedAt))).orderBy(desc(journeyStopDeclarations.declaredAt)).limit(1),
      getDb().select().from(journeyExceptions).where(and(eq(journeyExceptions.assignmentId, assignment.id), eq(journeyExceptions.exceptionType, "route_deviation"), eq(journeyExceptions.status, "open"))).limit(1),
    ]);
    const remainingMetres = booking.dropoffLatitude != null && booking.dropoffLongitude != null
      ? Math.round(pointDistanceMetres({ latitude, longitude }, { latitude: booking.dropoffLatitude, longitude: booking.dropoffLongitude }))
      : null;
    const thresholdMinutes = activeDeviation ? Math.min(baseMinutes, deviationMinutes) : baseMinutes;
    const candidate = stationary.length >= minimumPoints
      && durationSeconds >= thresholdMinutes * 60
      && (booking.serviceType === "hourly" || remainingMetres == null || remainingMetres >= minimumRemainingMetres);
    if (declaredStop && resumed && !activeStopException) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE journey_stop_declarations SET cleared_at = ? WHERE assignment_id = ? AND cleared_at IS NULL`).bind(serverTimestamp, assignment.id),
        env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'driver_stop_cleared', ?, ?)`).bind(booking.reference, `driver-stop-cleared:${declaredStop.id}`, serverTimestamp),
      ]);
    }
    if (activeStopException && resumed) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE journey_exceptions SET status = 'resolved', stop_duration_seconds = ?, last_seen_at = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'open'`).bind(durationSeconds, serverTimestamp, serverTimestamp, serverTimestamp, activeStopException.id),
        env.DB.prepare(`UPDATE journey_stop_declarations SET cleared_at = ? WHERE assignment_id = ? AND cleared_at IS NULL`).bind(serverTimestamp, assignment.id),
        env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'abnormal_stop_resolved', ?, ?)`).bind(booking.reference, `abnormal-stop-resolved:${activeStopException.id}`, serverTimestamp),
      ]);
      abnormalStop = { status: "resolved", durationSeconds };
    } else if (candidate && declaredStop) {
      abnormalStop = { status: "explained", durationSeconds, reason: declaredStop.reason };
    } else if (candidate && activeStopException) {
      await getDb().update(journeyExceptions).set({ stopDurationSeconds: durationSeconds, distanceMetres: remainingMetres ?? 0, consecutivePoints: stationary.length, lastSeenAt: serverTimestamp, updatedAt: serverTimestamp }).where(eq(journeyExceptions.id, activeStopException.id));
      abnormalStop = { status: "open", durationSeconds };
    } else if (candidate) {
      const exceptionId = crypto.randomUUID();
      const startedAt = stationary[stationary.length - 1].serverTimestamp;
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO journey_exceptions (id, booking_reference, assignment_id, exception_type, status, severity, distance_metres, corridor_metres, consecutive_points, stop_duration_seconds, started_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'abnormal_stop', 'open', 'warning', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(exceptionId, booking.reference, assignment.id, remainingMetres ?? 0, stopRadiusMetres, stationary.length, durationSeconds, startedAt, serverTimestamp, serverTimestamp, serverTimestamp),
        env.DB.prepare(`INSERT INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'abnormal_stop_started', ?, ?)`).bind(booking.reference, `abnormal-stop-started:${exceptionId}`, serverTimestamp),
      ]);
      abnormalStop = { status: "open", durationSeconds };
    } else {
      abnormalStop = { status: durationSeconds >= 10 * 60 ? "potential" : durationSeconds >= 5 * 60 ? "observe" : "normal", durationSeconds };
    }
  }
  return NextResponse.json({ ok: true, accepted: (result.meta.changes ?? 0) > 0, quality, serverTimestamp, deviation, abnormalStop });
}

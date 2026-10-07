import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, journeyLocations, smartTrips, smartTripVersions } from "@/db/schema";
import { tripSnapshot, type TripRow, type TripSnapshot } from "@/lib/smart-trips";
import { activeAssignment } from "@/lib/trip-access";
import { liveStatus } from "@/lib/trip-live";

/** Recent, usable GPS from the current outbound assignment only. */
export async function driverPosition(reference: string | null, now = new Date()) {
  if (!reference) return null;
  const assignment = await activeAssignment(reference);
  if (!assignment || assignment.tokenExpiresAt <= now.toISOString() || !["going_to_standby", "standby", "passenger_verified", "trip_started", "passenger_picked_up"].includes(assignment.currentStatus)) return null;
  const since = new Date(now.getTime() - 90_000).toISOString();
  const [row] = await getDb().select({ lat: journeyLocations.latitude, lng: journeyLocations.longitude, at: journeyLocations.serverTimestamp })
    .from(journeyLocations).innerJoin(bookings, eq(bookings.reference, journeyLocations.bookingReference)).where(and(eq(bookings.status, "confirmed"), eq(journeyLocations.bookingReference, reference), eq(journeyLocations.assignmentId, assignment.id), eq(journeyLocations.driverId, assignment.driverId), eq(journeyLocations.quality, "good"), lte(journeyLocations.accuracyMetres, 200), gte(journeyLocations.serverTimestamp, since), lte(journeyLocations.serverTimestamp, now.toISOString())))
    .orderBy(desc(journeyLocations.serverTimestamp)).limit(1);
  return row ? { lat: row.lat, lng: row.lng, updatedAt: row.at } : null;
}

export async function liveFor(trip: TripRow, now = new Date()) {
  const snap = tripSnapshot(trip);
  if (!snap) return null;
  const driver = await driverPosition(trip.bookingReference, now);
  return { snap, live: liveStatus(snap, now, driver, snap.liveSkipped ?? []) };
}

/** Applies a change made on the day (skip a stop, or shorten one) to the customer's copy, as a new version. */
export async function adjustLive(trip: TripRow, change: { kind: "skip" | "shorten" | "restore"; stopId: string; minutes?: number }, by: string) {
  const snap = tripSnapshot(trip);
  if (!snap) throw new Error("NO_SNAPSHOT");
  const stop = snap.stops.find((s) => s.id === change.stopId);
  if (!stop) throw new Error("NO_STOP");
  const next: TripSnapshot = { ...snap, version: snap.version + 1, createdAt: new Date().toISOString(), liveSkipped: [...(snap.liveSkipped ?? [])] };
  let note: string;
  if (change.kind === "skip") { next.liveSkipped = [...new Set([...next.liveSkipped!, stop.id])]; note = `On the day: skipped ${stop.name}`; }
  else if (change.kind === "restore") { next.liveSkipped = next.liveSkipped!.filter((x) => x !== stop.id); note = `On the day: back in, ${stop.name}`; }
  else {
    const minutes = Math.min(Math.max(5, change.minutes ?? 15), stop.end - stop.start - 5);
    next.stops = snap.stops.map((s) => (s.id === stop.id ? { ...s, end: s.end - minutes } : s));
    note = `On the day: ${stop.name} shortened by ${minutes} min`;
  }
  const now = new Date().toISOString();
  await getDb().insert(smartTripVersions).values({ id: crypto.randomUUID(), tripId: trip.id, version: next.version, snapshotJson: JSON.stringify(next), note, createdBy: by, createdAt: now });
  await getDb().update(smartTrips).set({ snapshotJson: JSON.stringify(next), version: next.version, updatedAt: now }).where(eq(smartTrips.id, trip.id));
  return note;
}

export async function tripsToday() {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const rows = await getDb().select({ trip: smartTrips, bookingStatus: bookings.status }).from(smartTrips).leftJoin(bookings, eq(bookings.reference, smartTrips.bookingReference))
    .where(and(eq(smartTrips.tripDate, today), eq(smartTrips.status, "accepted"), eq(smartTrips.isTemplate, false)));
  return rows.filter((r) => !["cancelled", "binned", "no_show"].includes(r.bookingStatus ?? "")).map((r) => r.trip);
}

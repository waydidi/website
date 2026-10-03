import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { journeyLocations, smartTrips, smartTripVersions } from "@/db/schema";
import { tripSnapshot, type TripRow, type TripSnapshot } from "@/lib/smart-trips";
import { liveStatus } from "@/lib/trip-live";

/** Latest driver position for the trip's booking, if reported in the last 15 minutes. */
export async function driverPosition(reference: string | null) {
  if (!reference) return null;
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [row] = await getDb().select({ lat: journeyLocations.latitude, lng: journeyLocations.longitude, at: journeyLocations.serverTimestamp })
    .from(journeyLocations).where(and(eq(journeyLocations.bookingReference, reference), gte(journeyLocations.serverTimestamp, since)))
    .orderBy(desc(journeyLocations.serverTimestamp)).limit(1);
  return row ? { lat: row.lat, lng: row.lng, updatedAt: row.at } : null;
}

export async function liveFor(trip: TripRow, now = new Date()) {
  const snap = tripSnapshot(trip);
  if (!snap) return null;
  const driver = await driverPosition(trip.bookingReference);
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
  return getDb().select().from(smartTrips).where(and(eq(smartTrips.tripDate, today), eq(smartTrips.status, "accepted"), eq(smartTrips.isTemplate, false)));
}

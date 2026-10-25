import type { SecurityDatabase } from "./worker-db";
import { hmacSha256 } from "./security";
import { FUNNEL_RETENTION_DAYS, type FunnelEvent } from "./booking-funnel-rules";
import { COMMITTED_SQL } from "./booking-status";

export const funnelDdl = [
  "CREATE TABLE IF NOT EXISTS booking_funnel_events (event_id TEXT PRIMARY KEY,journey_hash TEXT NOT NULL,stage TEXT NOT NULL CHECK(stage IN ('quote','details','payment','confirmed')),service TEXT NOT NULL CHECK(service IN ('transfer','hourly')),created_at TEXT NOT NULL,UNIQUE(journey_hash,stage))",
  "CREATE INDEX IF NOT EXISTS booking_funnel_events_cohort ON booking_funnel_events(stage,created_at)",
  "CREATE TABLE IF NOT EXISTS booking_funnel_links (booking_hash TEXT PRIMARY KEY,journey_hash TEXT NOT NULL UNIQUE,service TEXT NOT NULL CHECK(service IN ('transfer','hourly')),created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS booking_funnel_optouts (journey_hash TEXT PRIMARY KEY,created_at TEXT NOT NULL)",
];
export async function ensureBookingFunnel(db: SecurityDatabase) { await db.batch(funnelDdl.map(sql => db.prepare(sql))); }
const journeyHash = (secret: string, id: string) => hmacSha256(secret, "funnel-journey:" + id);
const bookingHash = (secret: string, reference: string) => hmacSha256(secret, "funnel-booking:" + reference);

export async function recordFunnelEvent(db: SecurityDatabase, secret: string, event: FunnelEvent, at = new Date().toISOString()) {
  await ensureBookingFunnel(db);
  const journey = await journeyHash(secret, event.journeyId);
  await db.prepare(`INSERT OR IGNORE INTO booking_funnel_events(event_id,journey_hash,stage,service,created_at)
    SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM booking_funnel_optouts WHERE journey_hash=?)
    AND NOT EXISTS(SELECT 1 FROM booking_funnel_events WHERE journey_hash=? AND service!=?)
    AND NOT EXISTS(SELECT 1 FROM booking_funnel_links WHERE journey_hash=? AND service!=?)`)
    .bind(event.eventId, journey, event.stage, event.service, at, journey, journey, event.service, journey, event.service).run();
}

export async function forgetFunnel(db: SecurityDatabase, secret: string, id: string, at = new Date().toISOString()) {
  await ensureBookingFunnel(db);
  const journey = await journeyHash(secret, id);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO booking_funnel_optouts(journey_hash,created_at) VALUES(?,?)").bind(journey, at),
    db.prepare("DELETE FROM booking_funnel_events WHERE journey_hash=?").bind(journey),
    db.prepare("DELETE FROM booking_funnel_links WHERE journey_hash=?").bind(journey),
  ]);
}

export async function linkFunnelBooking(db: SecurityDatabase, secret: string, id: string, reference: string, service: string) {
  await ensureBookingFunnel(db);
  const journey = await journeyHash(secret, id), booking = await bookingHash(secret, reference), at = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO booking_funnel_links(booking_hash,journey_hash,service,created_at)
    SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM booking_funnel_optouts WHERE journey_hash=?)
    AND NOT EXISTS(SELECT 1 FROM booking_funnel_events WHERE journey_hash=? AND service!=?)`)
    .bind(booking, journey, service, at, journey, journey, service).run();
  // Covers a confirmation racing with the checkout's telemetry link.
  await confirmFunnelBooking(db, secret, reference);
}

export async function confirmFunnelBooking(db: SecurityDatabase, secret: string, reference: string) {
  await ensureBookingFunnel(db);
  const booking = await bookingHash(secret, reference);
  await db.prepare(`INSERT OR IGNORE INTO booking_funnel_events(event_id,journey_hash,stage,service,created_at)
    SELECT ?,l.journey_hash,'confirmed',l.service,? FROM booking_funnel_links l
    WHERE l.booking_hash=? AND NOT EXISTS(SELECT 1 FROM booking_funnel_optouts WHERE journey_hash=l.journey_hash)
    AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND status IN (${COMMITTED_SQL})
      AND (payment_status IN ('paid','partially_refunded') OR (payment_method='cash' AND payment_status='cash_due')))`)
    .bind("confirmed:" + booking, new Date().toISOString(), booking, reference).run();
}

export async function purgeBookingFunnel(db: SecurityDatabase, at = new Date()) {
  await ensureBookingFunnel(db);
  const cutoff = new Date(at.getTime() - FUNNEL_RETENTION_DAYS * 86400000).toISOString();
  // Purge whole expired journeys, so late steps do not create orphan cohorts.
  await db.batch([
    db.prepare("DELETE FROM booking_funnel_links WHERE journey_hash IN (SELECT journey_hash FROM booking_funnel_events GROUP BY journey_hash HAVING MIN(created_at)<?) OR created_at<?").bind(cutoff, cutoff),
    db.prepare("DELETE FROM booking_funnel_events WHERE journey_hash IN (SELECT journey_hash FROM booking_funnel_events GROUP BY journey_hash HAVING MIN(created_at)<?)").bind(cutoff),
    db.prepare("DELETE FROM booking_funnel_optouts WHERE created_at<?").bind(cutoff),
  ]);
}

export async function funnelReport(db: SecurityDatabase, start: string, end: string, service: string) {
  await ensureBookingFunnel(db);
  // Quote-date cohorts; only sequentially observed stages count in conversion.
  return (await db.prepare(`WITH journeys AS (
    SELECT journey_hash,service,MIN(CASE WHEN stage='quote' THEN created_at END) AS quoted,
      MAX(stage='details') AS details,MAX(stage='payment') AS payment,MAX(stage='confirmed') AS confirmed
    FROM booking_funnel_events GROUP BY journey_hash,service)
    SELECT COUNT(*) AS quote,COALESCE(SUM(details),0) AS details,
      COALESCE(SUM(details AND payment),0) AS payment,COALESCE(SUM(details AND payment AND confirmed),0) AS confirmed,
      COALESCE(SUM((payment AND NOT details) OR (confirmed AND NOT (details AND payment))),0) AS incomplete
    FROM journeys WHERE quoted>=? AND quoted<? AND (?='all' OR service=?)`)
    .bind(start, end, service, service).first())!;
}

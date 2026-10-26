import type { SecurityDatabase } from "./worker-db";
import type { bookingChangeRequests } from "@/db/schema";
import { ensureBookingChangeHistory } from "./booking-change-history";
import { toSatang } from "./money";

export type ChangeSubmission = typeof bookingChangeRequests.$inferInsert;

/** Claim the booking version and pending slot in the same write as the request. */
export async function insertBookingChange(db: SecurityDatabase, input: ChangeSubmission) {
  await ensureBookingChangeHistory(db);
  const request = db.prepare(`INSERT INTO booking_change_requests
    (id,booking_reference,pickup,dropoff,pickup_place_id,dropoff_place_id,pickup_date,pickup_time,vehicle_id,vehicle_name,
     fare_quote_id,return_fare_quote_id,distance_meters,duration_seconds,original_total,revised_total,price_difference,reason,booking_version,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE EXISTS(SELECT 1 FROM bookings WHERE reference=? AND booking_version=? AND total=? AND status='confirmed'
      AND julianday(pickup_date || 'T' || pickup_time || ':00+07:00')-julianday(?)>=3)
    AND NOT EXISTS(SELECT 1 FROM booking_change_requests WHERE booking_reference=? AND status='pending')
    AND NOT EXISTS(SELECT 1 FROM booking_assignments WHERE booking_reference=? AND revoked_at IS NULL
      AND current_status IN ('going_to_standby','standby','passenger_verified','trip_started','passenger_picked_up','completed','no_show'))
    AND EXISTS(SELECT 1 FROM fare_quotes WHERE id=? AND expires_at>?)
    AND (? IS NULL OR EXISTS(SELECT 1 FROM fare_quotes WHERE id=? AND expires_at>?))
    ON CONFLICT(id) DO NOTHING`)
    .bind(input.id, input.bookingReference, input.pickup, input.dropoff, input.pickupPlaceId, input.dropoffPlaceId,
      input.pickupDate, input.pickupTime, input.vehicleId, input.vehicleName, input.fareQuoteId, input.returnFareQuoteId ?? null,
      input.distanceMeters, input.durationSeconds, input.originalTotal, input.revisedTotal, input.priceDifference, input.reason ?? null,
      input.bookingVersion, input.createdAt, input.bookingReference, input.bookingVersion, input.originalTotal, input.createdAt, input.bookingReference,
      input.bookingReference, input.fareQuoteId, input.createdAt, input.returnFareQuoteId ?? null, input.returnFareQuoteId ?? null, input.createdAt);
  const alert = db.prepare(`INSERT INTO operations_alerts(id,booking_reference,alert_type,severity,title,details,dedupe_key,status,detected_at,created_at,updated_at)
    SELECT ?,booking_reference,'customer_journey_change','warning','Customer journey-change request',?,'journey-change:' || id,'open',created_at,created_at,created_at
    FROM booking_change_requests WHERE id=? AND booking_reference=? ON CONFLICT(dedupe_key) DO NOTHING`)
    .bind(`journey-change:${input.id}`, `Requested journey change. Price difference: THB ${input.priceDifference}.`, input.id, input.bookingReference);
  const result = await db.batch([request, alert]);
  // D1 includes rows written by the history trigger in its change count.
  return result[0].meta.changes > 0;
}

export function sameChangeSubmission(existing: typeof bookingChangeRequests.$inferSelect, input: {
  fareQuoteId: string; returnFareQuoteId?: string; vehicleId: string; bookingVersion: number; reason?: string; expectedRevisedTotalMinor?: number;
}) {
  return existing.fareQuoteId === input.fareQuoteId && existing.returnFareQuoteId === (input.returnFareQuoteId ?? null)
    && existing.vehicleId === input.vehicleId && existing.bookingVersion === input.bookingVersion
    && (existing.reason ?? "") === (input.reason?.trim() ?? "")
    && (input.expectedRevisedTotalMinor === undefined || toSatang(existing.revisedTotal) === input.expectedRevisedTotalMinor);
}

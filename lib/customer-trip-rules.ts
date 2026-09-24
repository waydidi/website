// Pure rules for the customer trip page. No database or Worker imports, so
// tests can load this file directly.

export const CUSTOMER_STAGES = ["confirmed", "assigned", "on_the_way", "waiting", "on_trip", "arrived"] as const;
export type CustomerStage = (typeof CUSTOMER_STAGES)[number] | "no_show" | "cancelled";

/** Maps the booking and the driver's own step to what the customer sees. */
export function customerStage(bookingStatus: string, driverStatus: string | null | undefined): CustomerStage {
  if (bookingStatus === "cancelled" || bookingStatus === "refunded") return "cancelled";
  if (bookingStatus === "no_show" || driverStatus === "no_show") return "no_show";
  if (bookingStatus === "completed") return "arrived";
  switch (driverStatus) {
    case "assigned": return "assigned";
    case "going_to_standby": return "on_the_way";
    case "standby":
    case "passenger_verified": return "waiting";
    case "trip_started":
    case "passenger_picked_up": return "on_trip";
    case "completed": return "arrived";
    default: return "confirmed";
  }
}

/** The driver steps that move the customer timeline to each stage. */
export const STAGE_DRIVER_STATUSES: Partial<Record<CustomerStage, string[]>> = {
  on_the_way: ["going_to_standby"],
  waiting: ["standby"],
  on_trip: ["trip_started", "passenger_picked_up"],
  arrived: ["completed"],
};

/** The car is only shown after pickup, while the customer is on board. */
export function locationVisible(stage: CustomerStage) {
  return stage === "on_trip";
}

/** A driver position older than this is not shown as live. */
export const LOCATION_STALE_MS = 10 * 60 * 1000;

export function freshLocation<T extends { serverTimestamp: string }>(point: T | null | undefined, now: number) {
  if (!point) return null;
  const at = new Date(point.serverTimestamp).getTime();
  return Number.isFinite(at) && now - at <= LOCATION_STALE_MS ? point : null;
}

/** The arrival estimate only covers the ride itself, to the drop-off. */
export function etaTarget(stage: CustomerStage): "pickup" | "dropoff" | null {
  return stage === "on_trip" ? "dropoff" : null;
}

export const ETA_CACHE_SECONDS = 120;

// ---- Share links ----

export const SHARE_GRACE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_TRIP_MS = 90 * 60 * 1000;

type ShareBooking = {
  pickupDate: string;
  pickupTime: string;
  routeDurationSeconds?: number | null;
  bookedHours?: number | null;
  serviceType?: string | null;
};

/** Scheduled end of the ride in epoch ms, from the booked pickup and the route or hours booked. */
export function scheduledTripEnd(booking: ShareBooking) {
  const pickup = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
  if (!Number.isFinite(pickup)) return null;
  const duration = booking.serviceType === "hourly" && booking.bookedHours
    ? booking.bookedHours * 60 * 60 * 1000
    : booking.routeDurationSeconds
      ? booking.routeDurationSeconds * 1000
      : DEFAULT_TRIP_MS;
  return pickup + duration;
}

/**
 * Share links stop working 2 hours after the trip: after drop-off when the
 * driver has finished, otherwise after the scheduled end. A trip still in
 * progress keeps its link working.
 */
export function shareLinkActive(input: { booking: ShareBooking; stage: CustomerStage; completedAt?: string | null; now: number }) {
  if (input.stage === "cancelled") return false;
  if (input.stage === "on_the_way" || input.stage === "waiting" || input.stage === "on_trip") return true;
  const completed = input.completedAt ? new Date(input.completedAt).getTime() : NaN;
  if (Number.isFinite(completed)) return input.now <= completed + SHARE_GRACE_MS;
  const end = scheduledTripEnd(input.booking);
  return end !== null && input.now <= end + SHARE_GRACE_MS;
}

/** A share token is `<issuedAt base36>.<signature hex>`. */
export function parseShareToken(token: string) {
  const match = /^([0-9a-z]{6,12})\.([0-9a-f]{32})$/u.exec(token);
  if (!match) return null;
  const issuedAt = parseInt(match[1], 36);
  return Number.isSafeInteger(issuedAt) ? { issuedAt, signature: match[2] } : null;
}

/** A link is valid only when issued after the most recent "stop sharing". */
export function shareIssuedAfterRevoke(issuedAt: number, revokedAt: string | null | undefined) {
  if (!revokedAt) return true;
  const revoked = new Date(revokedAt).getTime();
  return !Number.isFinite(revoked) || issuedAt > revoked;
}

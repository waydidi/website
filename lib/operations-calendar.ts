export const BANGKOK_OFFSET = "+07:00";
export const DEFAULT_ROUTE_SECONDS = 60 * 60;

export type CalendarBookingWindow = {
  reference: string;
  pickupDate: string;
  pickupTime: string;
  routeDurationSeconds: number | null;
  preparationBufferMinutes: number;
  postTripBufferMinutes: number;
};

export function validCalendarDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00${BANGKOK_OFFSET}`).getTime());
}

export function validCalendarTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?Z$/u.test(value) &&
    !Number.isNaN(new Date(value).getTime());
}

export function pickupTimestamp(pickupDate: string, pickupTime: string) {
  return new Date(`${pickupDate}T${pickupTime}:00${BANGKOK_OFFSET}`).getTime();
}

export function bookingWindow(booking: CalendarBookingWindow) {
  const pickup = pickupTimestamp(booking.pickupDate, booking.pickupTime);
  const durationSeconds = Math.max(15 * 60, booking.routeDurationSeconds ?? DEFAULT_ROUTE_SECONDS);
  return {
    pickup,
    startsAt: pickup - Math.max(0, booking.preparationBufferMinutes) * 60_000,
    endsAt: pickup + durationSeconds * 1000 + Math.max(0, booking.postTripBufferMinutes) * 60_000,
    estimated: booking.routeDurationSeconds == null,
  };
}

export function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function minutesBetween(start: number, end: number) {
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function attentionForJourney(input: {
  bookingStatus: string;
  attentionStatus: string;
  pickup: number;
  assignmentStatus?: string | null;
  hasAssignment: boolean;
  pendingEvidence: number;
  hasConflict: boolean;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  if (input.bookingStatus === "cancelled") return { level: "cancelled", reason: "Booking cancelled" };
  if (input.hasConflict) return { level: "critical", reason: "Driver schedule conflict" };
  if (input.attentionStatus === "attention") return { level: "critical", reason: "Marked for attention" };
  if (input.pendingEvidence > 0) return { level: "warning", reason: "Evidence needs review" };
  if (!input.hasAssignment && input.pickup - now <= 24 * 60 * 60 * 1000 && input.pickup > now) {
    return { level: "critical", reason: "Driver not assigned" };
  }
  if (input.hasAssignment && input.assignmentStatus === "assigned" && input.pickup - now <= 3 * 60 * 60 * 1000 && input.pickup > now) {
    return { level: "warning", reason: "Driver has not started" };
  }
  if (input.pickup < now && input.bookingStatus === "confirmed" && [null, "assigned", "going_to_standby"].includes(input.assignmentStatus ?? null)) {
    return { level: "critical", reason: "Pickup time passed" };
  }
  return { level: "normal", reason: null };
}

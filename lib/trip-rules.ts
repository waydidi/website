import { bangkokDepartureTimestamp } from "@/lib/booking-time";

// Pure trip-status rules shared by the driver API, the driver page and tests.
// Keep this file free of database or Worker imports.

export const DRIVER_STATUSES = [
  "assigned",
  "going_to_standby",
  "standby",
  "passenger_verified",
  "trip_started",
  "passenger_picked_up",
  "completed",
  "no_show",
] as const;

export type DriverStatus = (typeof DRIVER_STATUSES)[number];

// "passenger_picked_up" is legacy: no step leads to it any more, but old
// assignments stored with it can still finish the trip.
export const NEXT_DRIVER_STATUS: Partial<Record<DriverStatus, DriverStatus>> = {
  assigned: "going_to_standby",
  going_to_standby: "standby",
  standby: "passenger_verified",
  passenger_verified: "trip_started",
  trip_started: "completed",
  passenger_picked_up: "completed",
};

export const DRIVER_STATUS_COPY: Record<DriverStatus, { thai: string; english: string }> = {
  assigned: { thai: "ได้รับงาน", english: "Assigned" },
  going_to_standby: { thai: "กำลังไปจุดรับ", english: "On the way" },
  standby: { thai: "รอที่จุดรับ", english: "Waiting at pickup" },
  passenger_verified: { thai: "ยืนยัน PIN แล้ว", english: "PIN verified" },
  trip_started: { thai: "กำลังเดินทาง", english: "On trip" },
  passenger_picked_up: { thai: "กำลังเดินทาง", english: "On trip" },
  completed: { thai: "ส่งลูกค้าเรียบร้อย", english: "Arrived" },
  no_show: { thai: "ไม่พบผู้โดยสาร", english: "Passenger no-show" },
};

export const ACTIVE_TRIP_STATUSES: readonly DriverStatus[] = ["trip_started", "passenger_picked_up"];
export const FINAL_DRIVER_STATUSES: readonly DriverStatus[] = ["completed", "no_show"];

export function isDriverStatus(value: string): value is DriverStatus {
  return DRIVER_STATUSES.includes(value as DriverStatus);
}

export function evidenceRequired(status: DriverStatus) {
  return status === "standby" || status === "completed" || status === "no_show";
}

export function locationRequired(status: DriverStatus) {
  return status !== "assigned" && status !== "passenger_verified";
}

export function adminReviewRequired(status: DriverStatus) {
  return status === "completed" || status === "no_show";
}

/** Which point the driver's position is compared against for a step. */
export function expectedPointFor(status: DriverStatus): "pickup" | "dropoff" | null {
  if (status === "completed") return "dropoff";
  if (status === "going_to_standby") return null;
  return "pickup";
}

export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earth = 6_371_000;
  const latitude = radians(b.latitude - a.latitude);
  const longitude = radians(b.longitude - a.longitude);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return Math.round(2 * earth * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

// ---- Passenger no-show ----

export const AIRPORT_FREE_WAIT_MINUTES = 90;
export const STANDARD_FREE_WAIT_MINUTES = 30;
export const NO_SHOW_MAX_DISTANCE_METRES = 2_000;
export const TRIP_START_WARNING_METRES = 2_000;
export const NO_SHOW_MIN_NOTE_LENGTH = 3;

const AIRPORT_PATTERN = /airport|สนามบิน|机场|\b(BKK|DMK|HKT|CNX|USM|KBV|UTP|CEI|HDY)\b/iu;

type NoShowBooking = {
  pickup: string;
  pickupDate: string;
  pickupTime: string;
  flightNumber?: string | null;
  flightScheduledArrival?: string | null;
  flightEstimatedArrival?: string | null;
};

export function isAirportPickup(booking: Pick<NoShowBooking, "pickup" | "flightNumber">) {
  return Boolean(booking.flightNumber?.trim()) || AIRPORT_PATTERN.test(booking.pickup);
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * When the driver may report a no-show (epoch ms), or null if the pickup
 * time cannot be read. Airports: 90 minutes after the flight lands (latest
 * estimate, else schedule, else booked pickup time). Elsewhere: 30 minutes
 * after the booked pickup time. Never earlier than the booked pickup time.
 */
export function noShowEligibleAt(booking: NoShowBooking) {
  const pickup = bangkokDepartureTimestamp(booking.pickupDate, booking.pickupTime)
    ?? parseTime(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`);
  if (pickup === null) return null;
  if (!isAirportPickup(booking)) return pickup + STANDARD_FREE_WAIT_MINUTES * 60_000;
  const landed = parseTime(booking.flightEstimatedArrival) ?? parseTime(booking.flightScheduledArrival) ?? pickup;
  return Math.max(pickup, landed + AIRPORT_FREE_WAIT_MINUTES * 60_000);
}

// ---- Driver late to pickup ----

export const HOTEL_STANDBY_LEAD_MINUTES = 30;
export const AIRPORT_STANDBY_AFTER_LANDING_MINUTES = 10;

/**
 * When the driver must be waiting at pickup (epoch ms). Airports: 10 minutes
 * after the flight lands (latest estimate, else schedule, else the booked
 * pickup time). Everywhere else: 30 minutes before the booked pickup time.
 */
export function standbyDeadline(booking: NoShowBooking) {
  const pickup = bangkokDepartureTimestamp(booking.pickupDate, booking.pickupTime)
    ?? parseTime(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`);
  if (pickup === null) return null;
  if (!isAirportPickup(booking)) return pickup - HOTEL_STANDBY_LEAD_MINUTES * 60_000;
  const landed = parseTime(booking.flightEstimatedArrival) ?? parseTime(booking.flightScheduledArrival);
  return landed === null ? pickup : landed + AIRPORT_STANDBY_AFTER_LANDING_MINUTES * 60_000;
}

// ---- Offline step replay ----

export const OFFLINE_REPLAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const OFFLINE_REPLAY_MAX_FUTURE_MS = 2 * 60 * 1000;

/** Validates a client-reported tap time for a step sent late from an offline queue. */
export function acceptedOccurredAt(value: unknown, now: number, notBefore: number | null) {
  if (value == null || value === "") return new Date(now).toISOString();
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return null;
  if (time > now + OFFLINE_REPLAY_MAX_FUTURE_MS || time < now - OFFLINE_REPLAY_MAX_AGE_MS) return null;
  if (notBefore !== null && time < notBefore) return null;
  return new Date(Math.min(time, now)).toISOString();
}

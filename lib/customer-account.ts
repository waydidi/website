// Pure helpers for customer accounts. Kept free of database and runtime
// imports so they can be unit tested directly.

export const ACCOUNT_COOKIE = "waydidi_account";
export const SESSION_DAYS = 30;
export const CODE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_EMAIL_PER_HOUR = 5;
export const MAX_REQUESTS_PER_IP_PER_15_MIN = 10;

// Only bookings a customer actually committed to appear in their account.
export const ACCOUNT_VISIBLE_STATUSES = ["confirmed", "completed", "cancelled"] as const;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCode(code: string) {
  return /^\d{6}$/.test(code);
}

// Uniformly random 6-digit code using rejection sampling (no modulo bias).
export function generateSignInCode() {
  const limit = 4_294_000_000; // largest multiple of 1_000_000 below 2^32
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return String(buffer[0] % 1_000_000).padStart(6, "0");
  }
}

export function accountCookie(token: string, maxAgeSeconds = SESSION_DAYS * 86_400) {
  return `${ACCOUNT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export type TripBucket = "upcoming" | "completed" | "cancelled";

// A confirmed trip stays "upcoming" until a few hours after pickup so the
// customer can still see driver details while the ride is under way.
export function tripBucket(status: string, pickupDate: string, pickupTime: string, now = Date.now()): TripBucket {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  const pickup = new Date(`${pickupDate}T${pickupTime}:00+07:00`).getTime();
  return Number.isFinite(pickup) && pickup + 6 * 3_600_000 < now ? "completed" : "upcoming";
}

const DRIVER_STATUS_LABELS: Record<string, string> = {
  assigned: "Driver assigned",
  standby: "Driver on standby",
  trip_started: "Driver on the way",
  passenger_verified: "On board",
  completed: "Trip completed",
};

export function driverStatusLabel(status: string | null | undefined) {
  return status ? DRIVER_STATUS_LABELS[status] ?? "Driver assigned" : "Driver not yet assigned";
}

export function sanitizeProfileText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return trimmed || null;
}

export const CONTACT_PREFERENCES = ["email", "phone", "whatsapp", "line"] as const;

export const MAX_SAVED_PLACES = 20;
export const MAX_SAVED_PASSENGERS = 20;
const PHONE_PATTERN = /^[+\d][\d\s()-]{5,39}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateSavedPlace(input: Record<string, unknown>): Result<{ label: string; placeId: string; address: string }> {
  const label = sanitizeProfileText(input.label, 40);
  const address = sanitizeProfileText(input.address, 300);
  const placeId = typeof input.placeId === "string" ? input.placeId.trim() : "";
  if (!label) return { ok: false, error: "Give this place a name, such as Home or Hotel." };
  if (!address || !/^[\w-]{10,300}$/.test(placeId)) return { ok: false, error: "Choose an address from the suggestions." };
  return { ok: true, value: { label, placeId, address } };
}

export function validateSavedPassenger(input: Record<string, unknown>): Result<{ name: string; surname: string; email: string | null; phone: string | null; notes: string | null }> {
  const name = sanitizeProfileText(input.name, 80);
  const surname = sanitizeProfileText(input.surname, 80);
  const email = normalizeEmail(input.email) || null;
  const phone = sanitizeProfileText(input.phone, 40);
  const notes = sanitizeProfileText(input.notes, 300);
  if (!name || !surname) return { ok: false, error: "Enter the traveller's first name and surname." };
  if (email && !isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (phone && !PHONE_PATTERN.test(phone)) return { ok: false, error: "Enter a valid phone number." };
  return { ok: true, value: { name, surname, email, phone, notes } };
}

export const MAX_BILLING_PROFILES = 5;

export function validateBillingProfile(input: Record<string, unknown>): Result<{ name: string; taxId: string; branch: string; address: string }> {
  const name = sanitizeProfileText(input.name, 200) ?? "";
  const taxId = (typeof input.taxId === "string" ? input.taxId : "").replace(/[\s-]/g, "");
  const branch = sanitizeProfileText(input.branch, 60) || "Head office";
  const address = sanitizeProfileText(input.address, 500) ?? "";
  if (!name || name.length < 2) return { ok: false, error: "Enter the company or full name." };
  if (!/^\d{13}$/.test(taxId)) return { ok: false, error: "Enter the 13-digit tax ID." };
  if (address.length < 10) return { ok: false, error: "Enter the full billing address." };
  return { ok: true, value: { name, taxId, branch, address } };
}

/**
 * Search-form values for "book again" (same route) or "book the return
 * trip" (reversed). Place IDs come from the booking's fare quote so the
 * route picker can price the trip without re-selecting addresses.
 */
export function rebookQuery(
  trip: { pickup: string; dropoff: string; passengers: number; luggage: number; vehicle: string; serviceType: string; bookedHours: number | null },
  places: { pickupPlaceId: string; dropoffPlaceId: string } | null,
  mode: "again" | "return",
) {
  const reverse = mode === "return" && trip.serviceType !== "hourly";
  const params = new URLSearchParams({
    rebook: mode,
    service: trip.serviceType === "hourly" ? "hourly" : "transfer",
    pickup: reverse ? trip.dropoff : trip.pickup,
    passengers: String(trip.passengers),
    luggage: String(trip.luggage),
    vehicle: trip.vehicle,
  });
  if (trip.serviceType !== "hourly") params.set("dropoff", reverse ? trip.pickup : trip.dropoff);
  if (trip.serviceType === "hourly" && trip.bookedHours) params.set("hours", String(trip.bookedHours));
  if (places) {
    params.set("pickupPlaceId", reverse ? places.dropoffPlaceId : places.pickupPlaceId);
    if (trip.serviceType !== "hourly") params.set("dropoffPlaceId", reverse ? places.pickupPlaceId : places.dropoffPlaceId);
  }
  return `/?${params.toString()}#booking-search`;
}

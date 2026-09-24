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

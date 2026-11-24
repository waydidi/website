// A searched transfer saved under a random ride ID, so /reservation?ride=… can
// reopen the same search (and price it again) after a refresh, Back, or when the
// link is sent to someone. Holds trip inputs only: no names, phones or emails.
// The ID is 32 random hex characters; the trip itself stays on the server.

export const RIDE_SEARCH_DAYS = 7;
export const RIDE_PATH = "/reservation";

export type RideSearch = {
  pickupPlaceId: string;
  dropoffPlaceId: string;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  returnDate: string | null;
  returnTime: string | null;
  adults: number;
  children: number;
  luggage: number;
};

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const RIDE_ID = /^[0-9a-f]{32}$/;

export const isRideId = (value: unknown): value is string => typeof value === "string" && RIDE_ID.test(value);

export function newRideId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 300) : "");
const whole = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

/** Reads an untrusted body (or stored row) into a RideSearch, or null when anything is off. */
export function parseRideSearch(input: unknown): RideSearch | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const pickupPlaceId = typeof v.pickupPlaceId === "string" ? v.pickupPlaceId : "";
  const dropoffPlaceId = typeof v.dropoffPlaceId === "string" ? v.dropoffPlaceId : "";
  const pickup = text(v.pickup), dropoff = text(v.dropoff);
  const date = typeof v.date === "string" ? v.date : "", time = typeof v.time === "string" ? v.time : "";
  const adults = whole(v.adults, 1, 20), children = whole(v.children, 0, 20), luggage = whole(v.luggage, 0, 40);
  if (!PLACE_ID.test(pickupPlaceId) || !PLACE_ID.test(dropoffPlaceId) || !pickup || !dropoff) return null;
  if (!DATE.test(date) || !TIME.test(time) || adults === null || children === null || luggage === null) return null;
  if (adults + children > 20) return null;
  const hasReturn = v.returnDate != null || v.returnTime != null;
  const returnDate = hasReturn && typeof v.returnDate === "string" && DATE.test(v.returnDate) ? v.returnDate : null;
  const returnTime = hasReturn && typeof v.returnTime === "string" && TIME.test(v.returnTime) ? v.returnTime : null;
  if (hasReturn && (!returnDate || !returnTime)) return null;
  return { pickupPlaceId, dropoffPlaceId, pickup, dropoff, date, time, returnDate, returnTime, adults, children, luggage };
}

/** Same trip inputs give the same key, so reopening a ride does not save a new one. */
export const rideSearchKey = (ride: RideSearch) => JSON.stringify([ride.pickupPlaceId, ride.dropoffPlaceId, ride.pickup, ride.dropoff, ride.date, ride.time, ride.returnDate, ride.returnTime, ride.adults, ride.children, ride.luggage]);

export const rideExpiresAt = (now = Date.now()) => new Date(now + RIDE_SEARCH_DAYS * 86_400_000).toISOString();
export const rideUrl = (id: string) => `${RIDE_PATH}?ride=${id}`;

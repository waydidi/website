export const BOOKING_TIMEZONE = "Asia/Bangkok" as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function bangkokDepartureTimestamp(date: string, time: string) {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59 || minutes % 15 !== 0) return null;

  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return null;

  const timestamp = new Date(`${date}T${time}:00+07:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

// Outsourced drivers need notice: pickups must be at least 3 hours away.
export const MIN_BOOKING_LEAD_HOURS = 3;
const MIN_BOOKING_LEAD_MS = MIN_BOOKING_LEAD_HOURS * 60 * 60 * 1000;

export function validBangkokPickup(date: string, time: string, now = Date.now()) {
  const pickup = bangkokDepartureTimestamp(date, time);
  return pickup !== null && pickup >= now + MIN_BOOKING_LEAD_MS && pickup < now + 730 * 24 * 60 * 60 * 1000;
}

/** Earliest bookable pickup as Bangkok date and HH:MM, rounded up to the next 15-minute slot. */
export function earliestBangkokPickup(now = Date.now()) {
  const slot = 15 * 60 * 1000;
  const earliest = new Date(Math.ceil((now + MIN_BOOKING_LEAD_MS) / slot) * slot);
  const date = earliest.toLocaleDateString("en-CA", { timeZone: BOOKING_TIMEZONE });
  const time = earliest.toLocaleTimeString("en-GB", { timeZone: BOOKING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time };
}

export function bangkokDepartureIso(date: string, time: string) {
  const timestamp = bangkokDepartureTimestamp(date, time);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

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

export function validBangkokPickup(date: string, time: string, now = Date.now()) {
  const pickup = bangkokDepartureTimestamp(date, time);
  return pickup !== null && pickup > now && pickup < now + 730 * 24 * 60 * 60 * 1000;
}

export function bangkokDepartureIso(date: string, time: string) {
  const timestamp = bangkokDepartureTimestamp(date, time);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

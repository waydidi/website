import { and, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";

// "Someone arrived here …": a real Waydidi ride ended at this drop-off in the last 7 days.
// Only the sentence leaves the server — never names, times or booking details.

// Private homes are never shown, so a search can't reveal where a customer lives.
const PRIVATE = /\b(condo(minium)?|residence|residences|house|home|village|apartment|apartments|villa\s*\d|moo\s*\d+|soi\s*\d+)\b|คอนโด|หมู่บ้าน|บ้านเลขที่|อพาร์ทเมนท์/iu;
export const isPrivatePlace = (place: string) => PRIVATE.test(place);

const norm = (s: string) => s.split(",")[0].toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000, rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Wording for how long ago the ride arrived, or null when older than 7 days. */
export function arrivedPhrase(hoursAgo: number) {
  if (hoursAgo < 0 || hoursAgo > 7 * 24) return null;
  if (hoursAgo < 20) { const h = Math.max(1, Math.floor(hoursAgo)); return `Someone arrived here with Waydidi ${h} hour${h === 1 ? "" : "s"} ago`; }
  if (hoursAgo < 30) return "Someone arrived here with Waydidi 24 hours ago";
  if (hoursAgo < 48) return "Someone arrived here with Waydidi a day ago";
  if (hoursAgo <= 72) return "Someone arrived here with Waydidi 3 days ago";
  return "Someone arrived here with Waydidi 7 days ago";
}

export async function arrivedHere(place: string, point: { lat: number; lng: number } | null, now = Date.now()) {
  if (!place.trim() || isPrivatePlace(place)) return null;
  const since = new Date(now - 8 * 86400000).toISOString().slice(0, 10);
  const rows = await getDb().select({
    dropoff: bookings.dropoff, date: bookings.pickupDate, time: bookings.pickupTime, seconds: bookings.routeDurationSeconds,
    lat: bookings.dropoffLatitude, lng: bookings.dropoffLongitude,
  }).from(bookings).where(and(inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.pickupDate, since))).limit(500);
  const wanted = norm(place);
  let newest: number | null = null;
  for (const r of rows) {
    if (isPrivatePlace(r.dropoff)) continue;
    const near = point && r.lat != null && r.lng != null ? metres(point, { lat: r.lat, lng: r.lng }) <= 300 : false;
    const theirs = norm(r.dropoff);
    const named = wanted.length >= 5 && theirs.length >= 5 && (theirs === wanted || theirs.includes(wanted) || wanted.includes(theirs));
    if (!near && !named) continue;
    const start = Date.parse(`${r.date}T${r.time}:00+07:00`);
    if (!Number.isFinite(start)) continue;
    const arrived = start + (r.seconds ?? 3600) * 1000;
    if (arrived > now) continue;
    if (newest === null || arrived > newest) newest = arrived;
  }
  return newest === null ? null : arrivedPhrase((now - newest) / 3600000);
}

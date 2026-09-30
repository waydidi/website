import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { pointInPolygon, type Point } from "@/lib/geo";

export const HOURLY_VEHICLES = ["economy_sedan", "comfort_suv", "premium_minivan"] as const;
export type HourlyVehicle = typeof HOURLY_VEHICLES[number];
export const HOURLY_MIN_HOURS = 3;
export const HOURLY_MAX_HOURS = 10;
export const CITY_TO_CITY_MIN_HOURS = 6;
export const HOURLY_QUOTE_MINUTES = 30;
export const HOURLY_POLICY_VERSION = 2;
export const OVERTIME_RATES: Record<HourlyVehicle, number> = { economy_sedan: 300, comfort_suv: 350, premium_minivan: 400 };
export const APPROVED_HOURLY_PAIRS = [
  { id: "bangkok-pattaya", from: "bangkok", to: "pattaya", name: "Bangkok ↔ Pattaya" },
  { id: "bangkok-ayutthaya", from: "bangkok", to: "ayutthaya", name: "Bangkok ↔ Ayutthaya" },
  { id: "bangkok-ratchaburi", from: "bangkok", to: "ratchaburi", name: "Bangkok ↔ Ratchaburi / Maeklong / Damnoen Saduak" },
  { id: "bangkok-khao-yai", from: "bangkok", to: "khao-yai", name: "Bangkok ↔ Khao Yai National Park area" },
  { id: "bangkok-kanchanaburi", from: "bangkok", to: "kanchanaburi", name: "Bangkok ↔ Kanchanaburi" },
] as const;

export function approvedHourlyPair(a: string, b: string) {
  return APPROVED_HOURLY_PAIRS.find((p) => (p.from === a && p.to === b) || (p.from === b && p.to === a));
}

export function inHourlyArea(slug: string, point: Point) {
  return Boolean(HOURLY_AREAS.find((a) => a.slug === slug)?.polygons.some((ring) => pointInPolygon(point, ring.map(([lat, lng]) => ({ lat, lng })))));
}

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
export type HourlyLocation = Point & { addressComponents?: AddressComponent[] };
// These are service envelopes, not administrative borders. New destinations
// also require a server-resolved province, so an address name cannot enable them.
const inEnvelope = (p: Point, south: number, north: number, west: number, east: number) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east;
export function hourlyCityAt(point: HourlyLocation): string | null {
  const provinces = (point.addressComponents ?? []).filter((c) => c.types?.includes("administrative_area_level_1")).map((c) => `${c.longText ?? ""} ${c.shortText ?? ""}`).join(" ");
  if (inHourlyArea("bangkok", point)) return "bangkok";
  // Bangkok airport services include BKK and DMK, even across a provincial border.
  if (inEnvelope(point, 13.665, 13.715, 100.725, 100.775) || inEnvelope(point, 13.895, 13.935, 100.585, 100.625)) return "bangkok";
  if (/ratchaburi|ราชบุรี/i.test(provinces) && inEnvelope(point, 13.35, 13.9, 99.65, 100.1)) return "ratchaburi";
  if (/samut\s*songkhram|สมุทรสงคราม/i.test(provinces) && inEnvelope(point, 13.3, 13.65, 99.8, 100.1)) return "ratchaburi";
  if (/nakhon\s*ratchasima|prachin\s*buri|nakhon\s*nayok|saraburi|นครราชสีมา|ปราจีนบุรี|นครนายก|สระบุรี/i.test(provinces) && inEnvelope(point, 14.05, 14.75, 101.15, 101.65)) return "khao-yai";
  return HOURLY_AREAS.find((a) => inHourlyArea(a.slug, point))?.slug ?? null;
}

/** A single 15-minute grace period; any started hour after that is chargeable. */
export function hourlyOvertime(extraMinutes: number, hourlyRate: number) {
  if (!Number.isFinite(extraMinutes) || !Number.isFinite(hourlyRate) || hourlyRate < 0) throw new Error("Invalid overtime details");
  const hours = extraMinutes <= 15 ? 0 : Math.ceil(extraMinutes / 60);
  return { minutes: Math.max(0, extraMinutes), hours, rate: hourlyRate, total: hours * hourlyRate };
}

export function validHourlyQuoteWindow(quote: { createdAt: string; expiresAt: string; pricingVersion: number }, now = Date.now()) {
  const created = Date.parse(quote.createdAt), expires = Date.parse(quote.expiresAt);
  return quote.pricingVersion === HOURLY_POLICY_VERSION && Number.isFinite(created) && Number.isFinite(expires) && created <= now && expires > now && expires <= created + HOURLY_QUOTE_MINUTES * 60_000;
}

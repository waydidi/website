import { getDb } from "@/db";
import { hourlyAreaRates } from "@/db/schema";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { VEHICLE_IDS, type PricingVehicleId } from "@/lib/pricing";

// By-the-hour prices per city and car: a rate per hour under 4 hours, then fixed
// package prices for 4, 5, 6, 7–8 and 9–10 hours.
export type AreaRate = { hourlyRate: number; p4: number; p5: number; p6: number; p8: number; p10: number };
export const HOURLY_MIN_HOURS = 1;
export const HOURLY_MAX_HOURS = 10;

const scale = (rate: number): AreaRate => {
  const f = rate / 300; const r = (n: number) => Math.round((n * f) / 50) * 50;
  return { hourlyRate: rate, p4: r(1400), p5: r(1600), p6: r(2400), p8: r(2700), p10: r(3000) };
};
// Starting prices (sedan from Waydidi's price list; other cars scaled from their hourly rate).
export const DEFAULT_AREA_RATES: Record<PricingVehicleId, AreaRate> = {
  economy_sedan: { hourlyRate: 300, p4: 1400, p5: 1600, p6: 2400, p8: 2700, p10: 3000 },
  comfort_bmw: scale(400),
  comfort_suv: scale(380),
  premium_minivan: scale(450),
};

export function priceForHours(rate: AreaRate, hours: number) {
  if (hours < 4) return hours * rate.hourlyRate;
  if (hours === 4) return rate.p4;
  if (hours === 5) return rate.p5;
  if (hours === 6) return rate.p6;
  if (hours <= 8) return rate.p8;
  return rate.p10;
}

export type AreaSetting = { slug: string; active: boolean; sortOrder: number; rates: Record<PricingVehicleId, AreaRate & { active: boolean }> };

/** Every city with its saved (or starting) prices and on/off state. */
export async function hourlyAreaSettings(): Promise<AreaSetting[]> {
  const rows = await getDb().select().from(hourlyAreaRates).catch(() => []);
  return HOURLY_AREAS.map((area, index) => {
    const mine = rows.filter((r) => r.areaSlug === area.slug);
    const meta = mine.find((r) => r.vehicleId === "_area");
    const rates = Object.fromEntries(VEHICLE_IDS.map((v) => {
      const row = mine.find((r) => r.vehicleId === v);
      return [v, row ? { hourlyRate: row.hourlyRate, p4: row.p4, p5: row.p5, p6: row.p6, p8: row.p8, p10: row.p10, active: row.active } : { ...DEFAULT_AREA_RATES[v], active: true }];
    })) as AreaSetting["rates"];
    return { slug: area.slug, active: meta ? meta.active : true, sortOrder: meta?.sortOrder ?? index, rates };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Prices for each car for a booking of `hours` in one city. */
export async function areaHourlyPrices(slug: string, hours: number) {
  const area = (await hourlyAreaSettings()).find((a) => a.slug === slug && a.active);
  if (!area) return null;
  return Object.fromEntries(VEHICLE_IDS.filter((v) => area.rates[v].active).map((v) => {
    const rate = area.rates[v];
    return [v, { total: priceForHours(rate, hours), basePrice: priceForHours(rate, hours), includedDistanceMeters: 0, extraHourRate: rate.hourlyRate, extraDistanceRate: 0 }];
  }));
}

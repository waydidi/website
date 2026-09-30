import { getDb } from "@/db";
import { hourlyAreaRates } from "@/db/schema";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { VEHICLE_IDS, type PricingVehicleId } from "@/lib/pricing";
import { HOURLY_VEHICLES, OVERTIME_RATES } from "@/lib/hourly-policy";

// By-the-hour prices per city and car: a rate per hour under 4 hours, then fixed
// package prices for 4, 5, 6, 7–8 and 9–10 hours.
export type AreaRate = { hourlyRate: number; p4: number; p5: number; p6: number; p8: number; p10: number; c6: number; c7: number; c8: number; c9: number; c10: number };
// City-to-city (pickup or drop-off outside the city's border): at least 6 hours.
export const CITY_TO_CITY_MIN_HOURS = 6;
export const HOURLY_MIN_HOURS = 3;
export const HOURLY_MAX_HOURS = 10;

const scale = (rate: number): AreaRate => {
  const f = rate / 300; const r = (n: number) => Math.round((n * f) / 50) * 50;
  return { hourlyRate: rate, p4: r(1400), p5: r(1600), p6: r(2400), p8: r(2700), p10: r(3000), c6: r(2200), c7: r(2400), c8: r(2600), c9: r(2800), c10: r(3000) };
};
// Starting prices (sedan from Waydidi's price list; other cars scaled from their hourly rate).
export const DEFAULT_AREA_RATES: Record<PricingVehicleId, AreaRate> = {
  economy_sedan: { hourlyRate: 300, p4: 1400, p5: 1600, p6: 1800, p8: 2700, p10: 3000, c6: 2500, c7: 2800, c8: 3100, c9: 3400, c10: 3700 },
  comfort_bmw: scale(400),
  comfort_suv: scale(380),
  premium_minivan: scale(450),
};

export function priceForHours(rate: AreaRate, hours: number, cityToCity = false) {
  if (cityToCity) return [rate.c6, rate.c6, rate.c7, rate.c8, rate.c9, rate.c10][Math.min(5, Math.max(0, hours - 5))];
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
  const rows = await getDb().select().from(hourlyAreaRates);
  return HOURLY_AREAS.map((area, index) => {
    const mine = rows.filter((r) => r.areaSlug === area.slug);
    const meta = mine.find((r) => r.vehicleId === "_area");
    const rates = Object.fromEntries(VEHICLE_IDS.map((v) => {
      const row = mine.find((r) => r.vehicleId === v);
      const d = DEFAULT_AREA_RATES[v];
      return [v, row ? { hourlyRate: row.hourlyRate, p4: row.p4, p5: row.p5, p6: row.p6, p8: row.p8, p10: row.p10, c6: row.c6, c7: row.c7, c8: row.c8, c9: row.c9, c10: row.c10, active: v !== "comfort_bmw" && row.active } : { ...d, active: v !== "comfort_bmw" }];
    })) as AreaSetting["rates"];
    return { slug: area.slug, active: meta ? meta.active : true, sortOrder: meta?.sortOrder ?? index, rates };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Prices for each car for a booking of `hours` in one city. */
export async function areaHourlyPrices(slug: string, hours: number) {
  if (!Number.isInteger(hours) || hours < HOURLY_MIN_HOURS || hours > HOURLY_MAX_HOURS) return null;
  const area = (await hourlyAreaSettings()).find((a) => a.slug === slug && a.active);
  if (!area) return null;
  return Object.fromEntries(HOURLY_VEHICLES.filter((v) => area.rates[v].active).map((v) => {
    const rate = area.rates[v];
    return [v, { total: priceForHours(rate, hours), basePrice: priceForHours(rate, hours), includedDistanceMeters: 0, unlimitedKilometres: true, tollsIncluded: true, overtimeGraceMinutes: 15, extraHourRate: OVERTIME_RATES[v], extraDistanceRate: 0 }];
  }));
}

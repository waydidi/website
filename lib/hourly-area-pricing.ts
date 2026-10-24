import { getDb } from "@/db";
import { hourlyAreaRates } from "@/db/schema";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { VEHICLE_IDS, type PricingVehicleId } from "@/lib/pricing";
import { HOURLY_RATES, HOURLY_VEHICLES, OVERTIME_RATES } from "@/lib/hourly-policy";

// By-the-hour prices per city and car: hours × the car's hourly rate.
export type AreaRate = { hourlyRate: number };
// City-to-city (pickup or drop-off outside the city's border): at least 6 hours.
export const CITY_TO_CITY_MIN_HOURS = 6;
export const HOURLY_MIN_HOURS = 3;
export const HOURLY_MAX_HOURS = 10;

// Starting prices for every city (BMW is not offered by the hour).
export const DEFAULT_AREA_RATES: Record<PricingVehicleId, AreaRate> = {
  economy_sedan: { hourlyRate: HOURLY_RATES.economy_sedan },
  comfort_bmw: { hourlyRate: HOURLY_RATES.premium_minivan },
  comfort_suv: { hourlyRate: HOURLY_RATES.comfort_suv },
  premium_minivan: { hourlyRate: HOURLY_RATES.premium_minivan },
};

export const priceForHours = (rate: AreaRate, hours: number) => hours * rate.hourlyRate;

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
      return [v, row ? { hourlyRate: row.hourlyRate, active: v !== "comfort_bmw" && row.active } : { ...d, active: v !== "comfort_bmw" }];
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

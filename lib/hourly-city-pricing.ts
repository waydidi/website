import { getDb } from "@/db";
import { hourlyCityPairRates, type hourlyQuotes } from "@/db/schema";
import { CITY_TO_CITY_MIN_HOURS, HOURLY_MAX_HOURS, hourlyAreaSettings, priceForHours } from "@/lib/hourly-area-pricing";
import { APPROVED_HOURLY_PAIRS, HOURLY_RATES, HOURLY_VEHICLES, OVERTIME_RATES, type HourlyVehicle } from "@/lib/hourly-policy";

/** Per car: whether the pair offers it, and the hourly rate it uses (from the pair's first city, so both directions match). */
export type CityRate = { hourlyRate: number; active: boolean };
export type CityPairSetting = { id: string; name: string; active: boolean; maxDrivingMinutes: number; rates: Record<HourlyVehicle, CityRate> };

export async function hourlyCityPairSettings(): Promise<CityPairSetting[]> {
  const [rows, areas] = await Promise.all([getDb().select().from(hourlyCityPairRates), hourlyAreaSettings()]);
  return APPROVED_HOURLY_PAIRS.map((pair) => {
    const mine = rows.filter((r) => r.pairId === pair.id);
    const meta = mine.find((r) => r.vehicleId === "_pair");
    const home = areas.find((a) => a.slug === pair.from);
    return { id: pair.id, name: pair.name, active: meta?.active ?? true, maxDrivingMinutes: meta?.maxDrivingMinutes ?? 360,
      rates: Object.fromEntries(HOURLY_VEHICLES.map((v) => {
        const row = mine.find((r) => r.vehicleId === v);
        return [v, { hourlyRate: home?.rates[v].hourlyRate ?? HOURLY_RATES[v], active: row ? row.active : true }];
      })) as CityPairSetting["rates"] };
  });
}

/** City-to-city prices: hours (6 to 10) × the hourly rate. */
export function cityPairPrices(pair: CityPairSetting, hours: number) {
  if (!pair.active || !Number.isInteger(hours) || hours < CITY_TO_CITY_MIN_HOURS || hours > HOURLY_MAX_HOURS) return null;
  return Object.fromEntries(HOURLY_VEHICLES.filter((v) => pair.rates[v].active).map((v) => [v, {
    total: priceForHours(pair.rates[v], hours), basePrice: priceForHours(pair.rates[v], hours), includedDistanceMeters: 0,
    unlimitedKilometres: true, tollsIncluded: true, overtimeGraceMinutes: 15,
    extraHourRate: OVERTIME_RATES[v], extraDistanceRate: 0,
  }]));
}

/** Rates stay locked for the quote window; current availability still wins. */
export async function hourlyQuoteVehicleAvailable(quote: typeof hourlyQuotes.$inferSelect, vehicle: string) {
  if (!HOURLY_VEHICLES.includes(vehicle as HourlyVehicle)) return false;
  const v = vehicle as HourlyVehicle;
  const areas = await hourlyAreaSettings();
  if (!areas.find((a) => a.slug === quote.areaId && a.active && a.rates[v].active)) return false;
  if (quote.cityPairId) {
    const definition = APPROVED_HOURLY_PAIRS.find((p) => p.id === quote.cityPairId);
    if (!definition) return false;
    for (const slug of [definition.from, definition.to]) {
      const area = areas.find((a) => a.slug === slug);
      if (area && (!area.active || !area.rates[v].active)) return false;
    }
    const pair = (await hourlyCityPairSettings()).find((p) => p.id === quote.cityPairId);
    return Boolean(pair?.active && pair.rates[v].active);
  }
  return Boolean(areas.find((a) => a.slug === quote.pricingAreaSlug && a.active && a.rates[v].active));
}

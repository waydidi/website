import { getDb } from "@/db";
import { hourlyCityPairRates, type hourlyQuotes } from "@/db/schema";
import { hourlyAreaSettings } from "@/lib/hourly-area-pricing";
import { APPROVED_HOURLY_PAIRS, HOURLY_VEHICLES, OVERTIME_RATES, type HourlyVehicle } from "@/lib/hourly-policy";

export const CITY_PACKAGE_KEYS = ["c6", "c7", "c8", "c9", "c10"] as const;
export type CityRate = Record<typeof CITY_PACKAGE_KEYS[number], number> & { extraHourRate: number; active: boolean };
export type CityPairSetting = { id: string; name: string; active: boolean; maxDrivingMinutes: number; rates: Record<HourlyVehicle, CityRate> };
export const DEFAULT_CITY_RATES: Record<HourlyVehicle, CityRate> = {
  economy_sedan: { c6: 2500, c7: 2800, c8: 3100, c9: 3400, c10: 3700, extraHourRate: 300, active: true },
  comfort_suv: { c6: 2900, c7: 3250, c8: 3600, c9: 3950, c10: 4300, extraHourRate: 350, active: true },
  premium_minivan: { c6: 3500, c7: 3800, c8: 4100, c9: 4300, c10: 4500, extraHourRate: 400, active: true },
};

export async function hourlyCityPairSettings(): Promise<CityPairSetting[]> {
  const rows = await getDb().select().from(hourlyCityPairRates);
  return APPROVED_HOURLY_PAIRS.map((pair) => {
    const mine = rows.filter((r) => r.pairId === pair.id);
    const meta = mine.find((r) => r.vehicleId === "_pair");
    return { id: pair.id, name: pair.name, active: meta?.active ?? true, maxDrivingMinutes: meta?.maxDrivingMinutes ?? 360,
      rates: Object.fromEntries(HOURLY_VEHICLES.map((v) => {
        const row = mine.find((r) => r.vehicleId === v);
        return [v, row ? { c6: row.c6, c7: row.c7, c8: row.c8, c9: row.c9, c10: row.c10, extraHourRate: OVERTIME_RATES[v], active: row.active } : { ...DEFAULT_CITY_RATES[v] }];
      })) as CityPairSetting["rates"] };
  });
}

export function cityPairPrices(pair: CityPairSetting, hours: number) {
  if (!pair.active || !Number.isInteger(hours) || hours < 6 || hours > 10) return null;
  const key = CITY_PACKAGE_KEYS[hours - 6];
  return Object.fromEntries(HOURLY_VEHICLES.filter((v) => pair.rates[v].active).map((v) => [v, {
    total: pair.rates[v][key], basePrice: pair.rates[v][key], includedDistanceMeters: 0,
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

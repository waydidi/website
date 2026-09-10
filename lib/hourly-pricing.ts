import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { hourlyPackages } from "@/db/schema";
import { VEHICLE_IDS, type PricingVehicleId } from "@/lib/pricing";

export const DEFAULT_HOURLY_PACKAGES: Record<PricingVehicleId, { minimumHours:number;basePrice:number;additionalHourPrice:number;includedKmPerHour:number;extraPricePerKm:number }> = {
  economy_sedan: { minimumHours: 3, basePrice: 1800, additionalHourPrice: 600, includedKmPerHour: 15, extraPricePerKm: 12 },
  comfort_bmw: { minimumHours: 3, basePrice: 3000, additionalHourPrice: 1000, includedKmPerHour: 15, extraPricePerKm: 18 },
  comfort_suv: { minimumHours: 3, basePrice: 2700, additionalHourPrice: 900, includedKmPerHour: 18, extraPricePerKm: 18 },
  premium_minivan: { minimumHours: 3, basePrice: 3300, additionalHourPrice: 1100, includedKmPerHour: 18, extraPricePerKm: 20 },
};

export async function hourlyPrices(areaId: string | null, hours: number) {
  const rows = await getDb().select().from(hourlyPackages).where(eq(hourlyPackages.active, true));
  return Object.fromEntries(VEHICLE_IDS.map((vehicleId) => {
    const rule = rows.find((r) => r.vehicleId === vehicleId && r.areaId === areaId) ?? rows.find((r) => r.vehicleId === vehicleId && r.areaId === "ANY") ?? DEFAULT_HOURLY_PACKAGES[vehicleId];
    const extraHours = Math.max(0, hours - rule.minimumHours);
    return [vehicleId, { total: rule.basePrice + extraHours * rule.additionalHourPrice, basePrice: rule.basePrice, includedDistanceMeters: hours * rule.includedKmPerHour * 1000, extraHourRate: rule.additionalHourPrice, extraDistanceRate: rule.extraPricePerKm }];
  }));
}

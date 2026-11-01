import { VEHICLES, vehicleFits, type VehicleId } from "./vehicles";
// Capacity/comfort order is the vehicle catalogue order, not the quoted price.
export function recommendVehicles(passengers: number, bags: number, selected: string, available: readonly string[] = Object.keys(VEHICLES)) {
  const classes = (Object.keys(VEHICLES) as VehicleId[]).filter(id => available.includes(id));
  const best = classes.find(id => vehicleFits(id, passengers, bags)) ?? null;
  const index = classes.indexOf(selected as VehicleId);
  const upgrade = best && index >= 0 ? classes.slice(index + 1).find(id => vehicleFits(id, passengers, bags)) ?? null : null;
  return { best, upgrade };
}

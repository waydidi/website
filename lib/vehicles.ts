// Seats and large suitcases per vehicle class. A "bag" is one checked
// suitcase; each comes with a carry-on, matching the passenger panel's
// "sets of bags". These are standard Thai transfer capacities pending
// confirmation from operations: change them here and every card, the
// booking form and checkout follow.
export const VEHICLES = {
  economy_sedan: { name: "Economy sedan", total: 1250, passengers: 3, bags: 2 },
  comfort_bmw: { name: "Comfort BMW", total: 1800, passengers: 3, bags: 2 },
  comfort_suv: { name: "Comfort SUV", total: 2200, passengers: 4, bags: 4 },
  premium_minivan: { name: "Premium Minivan", total: 2850, passengers: 9, bags: 9 },
} as const;

export type VehicleId = keyof typeof VEHICLES;

export function vehicleFits(id: VehicleId, passengers: number, bags: number) {
  const vehicle = VEHICLES[id];
  return passengers <= vehicle.passengers && bags <= vehicle.bags;
}

// The smallest class that carries the group, for preselecting a vehicle.
export function smallestFittingVehicle(passengers: number, bags: number): VehicleId | null {
  return (Object.keys(VEHICLES) as VehicleId[]).find((id) => vehicleFits(id, passengers, bags)) ?? null;
}

export const VEHICLES = {
  economy_sedan: { name: "Economy sedan", total: 1250 },
  comfort_bmw: { name: "Comfort BMW", total: 1800 },
  comfort_suv: { name: "Comfort SUV", total: 2200 },
  premium_minivan: { name: "Premium Minivan", total: 2850 },
} as const;

export type VehicleId = keyof typeof VEHICLES;

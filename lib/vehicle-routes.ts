// Which cars can be sold on which routes.
// Comfort BMW: only Bangkok ↔ Bangkok's airports (Suvarnabhumi BKK, Don Mueang DMK).

type Point = { latitude: number; longitude: number };
const AIRPORTS: Point[] = [{ latitude: 13.69, longitude: 100.7501 }, { latitude: 13.9126, longitude: 100.6067 }];
const km = (a: Point, b: Point) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const isAirport = (p: Point) => AIRPORTS.some((a) => km(a, p) <= 4);
// Greater Bangkok (city, Nonthaburi and Samut Prakan edges where the airports are).
const inBangkok = (p: Point) => p.latitude >= 13.48 && p.latitude <= 13.97 && p.longitude >= 100.32 && p.longitude <= 100.95;

export const bmwAllowed = (from: Point, to: Point) => (isAirport(from) && inBangkok(to)) || (isAirport(to) && inBangkok(from));

/** Every car class. tests/vehicle-routes.test.mjs keeps this equal to VEHICLES. */
export const ALL_VEHICLES = ["economy_sedan", "comfort_bmw", "comfort_suv", "premium_minivan"];

/** True when every car sold on this route has a price. A missing price means the area is not set up yet. */
export function routeHasAllPrices(prices: Record<string, unknown>, from: Point, to: Point) {
  return ALL_VEHICLES.filter((id) => id !== "comfort_bmw" || bmwAllowed(from, to)).every((id) => Object.hasOwn(prices, id));
}

/** Removes cars that aren't sold on this route from a price list. */
export function limitVehicles<T>(prices: Record<string, T>, from: Point, to: Point): Record<string, T> {
  if (bmwAllowed(from, to)) return prices;
  const rest = { ...prices };
  delete rest.comfort_bmw;
  return rest;
}

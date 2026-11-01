import { parseRouteStopSnapshots } from "./route-stops";

/** Driver payloads deliberately carry no customer prices or catalogue identifiers. */
export type DriverRouteStop = { name: string; durationMinutes: number };
export function driverRouteStops(routeStopsJson?: string | null, leg = "outbound"): DriverRouteStop[] {
  if (leg !== "outbound") return [];
  return parseRouteStopSnapshots(routeStopsJson).map(({ name, durationMinutes }) => ({ name, durationMinutes }));
}

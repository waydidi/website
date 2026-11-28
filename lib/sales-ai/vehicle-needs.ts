import { CHILD_SEAT_THB } from "../addons";
import { VEHICLES, type VehicleId } from "../vehicles";

// Special vehicle needs (Sales Intelligence PR 4, F04) as structured values. Pure.
// Only the child seat is an existing add-on with a price. Anything else (oversized items, wheelchair) has no
// published price or capacity, so it narrows the cars and asks staff to confirm and price it. Nothing is estimated.

export type VehicleNeeds = { childSeats: number; oversized: string; wheelchair: boolean };
export const NO_NEEDS: VehicleNeeds = { childSeats: 0, oversized: "", wheelchair: false };
export const MAX_CHILD_SEATS = 4; // the booking form's limit
/** Vehicle classes with a separate luggage area large enough to be worth checking. A staff member still confirms. */
const LARGE: VehicleId[] = ["comfort_suv", "premium_minivan"];

/** Model or file output is untrusted: validate, trim, strip markup and links. */
export function parseNeeds(input: { child_seats?: unknown; oversized?: unknown; wheelchair?: unknown } | null | undefined): VehicleNeeds {
  const seats = input?.child_seats;
  const oversized = typeof input?.oversized === "string" ? input.oversized.replace(/https?:\/\/\S+/gi, " ").replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return {
    childSeats: typeof seats === "number" && Number.isInteger(seats) && seats > 0 ? seats : 0,
    oversized: /^(none|no|-)$/i.test(oversized) ? "" : oversized,
    wheelchair: input?.wheelchair === true,
  };
}
export const hasNeeds = (n: VehicleNeeds) => Boolean(n.childSeats || n.oversized || n.wheelchair);
/** True when the price cannot come from the tables alone: the owner has to set it. */
export const needsOwnerPrice = (n: VehicleNeeds) => Boolean(n.oversized || n.wheelchair);
export const eligibleVehicles = (n: VehicleNeeds): VehicleId[] => (needsOwnerPrice(n) ? LARGE : (Object.keys(VEHICLES) as VehicleId[]));
export const filterCars = <T extends { vehicle: string }>(cars: T[], n: VehicleNeeds) => cars.filter((c) => (eligibleVehicles(n) as string[]).includes(c.vehicle));

/** One plain English line per need, for the owner's card and the assistant. */
export function needsLines(n: VehicleNeeds): string[] {
  return [
    n.childSeats ? `Child seats: ${n.childSeats} (existing add-on, ฿${CHILD_SEAT_THB} each, added on the booking form)` : "",
    n.oversized ? `Oversized luggage: ${n.oversized} (confirm it fits; needs your price)` : "",
    n.wheelchair ? "Wheelchair / accessibility (confirm a suitable car; needs your price)" : "",
  ].filter(Boolean);
}

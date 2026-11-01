import { formatMoney } from "../currency";
import { toSatang } from "../money";
import { VEHICLES, vehicleFits, type VehicleId } from "../vehicles";
import { cancellationPolicy } from "./tools";
import { quoteSchema, type QuoteInput } from "./schemas";

export type ResolvedPlace = { id: string; text: string; areaSlug?: string | null };
export type QuoteDependencies = {
  resolve: (text: string) => Promise<ResolvedPlace>;
  transfer: (request: Request) => Promise<Response>;
  hourly: (request: Request) => Promise<Response>;
};
/** Reuse the exported website handlers: no parallel pricing implementation. */
export async function quoteWith(input: QuoteInput, deps: QuoteDependencies, ip: string) {
  const args = quoteSchema.parse(input);
  const [pickup, dropoff] = await Promise.all([deps.resolve(args.pickup), deps.resolve(args.dropoff)]);
  if (args.service === "hourly" && !pickup.areaSlug) throw new Error("OPERATIONS_QUOTE_REQUIRED");
  const hourly = args.service === "hourly";
  const payload = { pickupPlaceId: pickup.id, dropoffPlaceId: dropoff.id, pickupDate: args.date, pickupTime: args.time, timezone: "Asia/Bangkok",
    ...(hourly ? { areaSlug: pickup.areaSlug, bookedHours: args.hours } : {}) };
  const path = hourly ? "/api/hourly-quote" : "/api/fare-quote";
  // Never forward browser cookies, authorization or a caller-supplied Origin.
  const response = await (hourly ? deps.hourly : deps.transfer)(new Request(`https://waydidi.com${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://waydidi.com", "cf-connecting-ip": ip }, body: JSON.stringify(payload),
  }));
  if (!response.ok) throw new Error("QUOTE_UNAVAILABLE");
  const quote = await response.json() as { prices: Record<string, { total: number }>; inclusions: unknown; expiresAt: string; bookedHours?: number };
  const vehicles = (Object.keys(VEHICLES) as VehicleId[])
    .filter(vehicle => quote.prices[vehicle] && vehicleFits(vehicle, args.passengers, args.bags))
    .map(vehicle => {
      const priceMinor = toSatang(quote.prices[vehicle].total);
      if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) throw new Error("INVALID_PRICE");
      return { vehicle, name: VEHICLES[vehicle].name, capacity: { passengers: VEHICLES[vehicle].passengers, bags: VEHICLES[vehicle].bags }, priceMinor, currency: "THB", displayPrice: formatMoney(priceMinor / 100, args.currency), displayApproximate: args.currency !== "THB" };
    }).sort((a,b) => a.priceMinor-b.priceMinor);
  return { service: args.service, pickup, dropoff, vehicles, inclusions: quote.inclusions, cancellationPolicy, expiresAt: quote.expiresAt,
    ...(quote.bookedHours ? { hours: quote.bookedHours } : {}), reserved: false, note: "Estimate per vehicle, not a reservation or price lock. Review resolved addresses and current price at checkout. Display conversions use indicative fallback exchange rates." };
}

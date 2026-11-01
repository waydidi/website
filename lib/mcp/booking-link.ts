import { linkSchema, type LinkInput } from "./schemas";
import { vehicleFits } from "../vehicles";

export function bookingLink(input: LinkInput) {
  if (!vehicleFits(input.vehicle, input.passengers, input.bags) || (input.service === "hourly" && input.vehicle === "comfort_bmw")) throw new Error("VEHICLE_CAPACITY");
  const url = new URL("https://waydidi.com/");
  url.searchParams.set("rebook", "mcp");
  for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  return { url: url.toString(), reserved: false, note: "Review exact addresses and the current price on the website before confirming. No booking has been created." };
}
export function parseMcpPrefill(params: URLSearchParams): LinkInput | null {
  if (params.get("rebook") !== "mcp") return null;
  const parsed = linkSchema.safeParse({
    pickup: params.get("pickup"), dropoff: params.get("dropoff"), date: params.get("date"), time: params.get("time"),
    passengers: Number(params.get("passengers")), bags: Number(params.get("bags")), vehicle: params.get("vehicle"),
    service: params.get("service") ?? "transfer", currency: params.get("currency") ?? "THB",
    ...(params.has("hours") ? { hours: Number(params.get("hours")) } : {}),
  });
  if (!parsed.success || !vehicleFits(parsed.data.vehicle, parsed.data.passengers, parsed.data.bags) || (parsed.data.service === "hourly" && parsed.data.vehicle === "comfort_bmw")) return null;
  return parsed.data;
}

import { z } from "zod";
import { validBangkokPickup } from "../booking-time";
import { DISPLAY_CURRENCIES } from "../currency";

const place = z.string().trim().min(2).max(300);
const shape = {
  pickup: place, dropoff: place,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  passengers: z.number().int().min(1).max(10), bags: z.number().int().min(0).max(12),
  service: z.enum(["transfer", "hourly"]).default("transfer"), hours: z.number().int().min(3).max(10).optional(),
  currency: z.enum(DISPLAY_CURRENCIES).default("THB"),
};
const check = (value: { date: string; time: string; service: string; hours?: number }, ctx: z.RefinementCtx) => {
  if (!validBangkokPickup(value.date, value.time)) ctx.addIssue({ code: "custom", path: ["date"], message: "Choose a pickup at least three hours from now (Asia/Bangkok)." });
  if (value.service === "hourly" && !value.hours) ctx.addIssue({ code: "custom", path: ["hours"], message: "Hourly service requires hours." });
};
export const quoteSchema = z.object(shape).strict().superRefine(check);
export const linkSchema = z.object({ ...shape, vehicle: z.enum(["economy_sedan", "comfort_bmw", "comfort_suv", "premium_minivan"]) }).strict().superRefine(check);
const searchSchema = z.object({ query: place }).strict();
export type QuoteInput = z.infer<typeof quoteSchema>;
export type LinkInput = z.infer<typeof linkSchema>;
export function validateTool(name: string, args: unknown) {
  return (name === "search_places" ? searchSchema : name === "get_quote" ? quoteSchema : name === "get_booking_link" ? linkSchema : z.never()).safeParse(args);
}
const properties = {
  pickup: { type: "string", description: "Exact Thai place/address or Google place ID prefixed with place_id:. Never send passenger information." }, dropoff: { type: "string", description: "Exact destination/address or place_id:GooglePlaceId" },
  date: { type: "string", description: "YYYY-MM-DD, at least three hours ahead in Asia/Bangkok" }, time: { type: "string", description: "HH:mm in Asia/Bangkok" },
  passengers: { type: "integer", minimum: 1, maximum: 10 }, bags: { type: "integer", minimum: 0, maximum: 12 },
  service: { type: "string", enum: ["transfer", "hourly"], default: "transfer" }, hours: { type: "integer", minimum: 3, maximum: 10, description: "Required for hourly" }, currency: { type: "string", enum: [...DISPLAY_CURRENCIES], default: "THB" },
};
const required = ["pickup", "dropoff", "date", "time", "passengers", "bags"];
export const toolDefinitions = [
  { name: "search_places", description: "Find Waydidi-known Thai destinations and airports from public static content. No Google lookup. Use an exact address for quotes; a city estimate is not a hotel quote.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: 300 } }, required: ["query"], additionalProperties: false } },
  { name: "get_quote", description: "Get current per-vehicle THB estimates using website pricing, capacity and route inclusions. No reservation or price lock. Hourly availability may require operations review. Other currencies are approximate.", inputSchema: { type: "object", properties, required, additionalProperties: false } },
  { name: "get_booking_link", description: "Create a prefilled waydidi.com search link, not a booking. The traveler must check the addresses and current price and complete checkout. No draft or customer data is saved.", inputSchema: { type: "object", properties: { ...properties, vehicle: { type: "string", enum: ["economy_sedan", "comfort_bmw", "comfort_suv", "premium_minivan"] } }, required: [...required, "vehicle"], additionalProperties: false } },
].map(t => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: t.name === "get_quote" } }));

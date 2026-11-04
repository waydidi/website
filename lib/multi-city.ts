import { z } from "zod";

// A multi-city journey is a request staff price by hand. It never creates a payable booking.
export const MULTI_CITY_MIN_LEGS = 2;
export const MULTI_CITY_MAX_LEGS = 6;

const place = z.string().trim().min(2).max(140);
const legSchema = z.object({
  from: place,
  to: place,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});
export type MultiCityLeg = z.infer<typeof legSchema>;

const legStart = (leg: MultiCityLeg) => `${leg.date}T${leg.time}`;

export const multiCityRequestSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
  passengers: z.number().int().min(1).max(20),
  luggage: z.number().int().min(0).max(30),
  note: z.string().trim().max(500).default(""),
  legs: z.array(legSchema).min(MULTI_CITY_MIN_LEGS).max(MULTI_CITY_MAX_LEGS),
}).refine((input) => input.legs.every((leg, i) => i === 0 || legStart(input.legs[i - 1]) < legStart(leg)), { path: ["legs"], message: "ORDER" });
export type MultiCityRequest = z.infer<typeof multiCityRequestSchema>;

/** The full journey as staff read it. Stored in the form note, because a form holds one pickup and drop-off. */
export function multiCityNote(request: Pick<MultiCityRequest, "legs" | "note">): string {
  const legs = request.legs.map((leg, i) => `${i + 1}) ${leg.date} ${leg.time}: ${leg.from} -> ${leg.to}`).join("\n");
  return `Multi-city request, quote every leg, the price must cover the whole journey:\n${legs}${request.note ? `\nCustomer note: ${request.note}` : ""}`;
}

import { z } from "zod";
import { VEHICLES } from "@/lib/vehicles";

// Answers a customer gives on the step-by-step booking form (/f/[token]).
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);

export const formAnswersSchema = z.object({
  name: text(100).min(1),
  phone: text(40).min(5),
  email: z.string().trim().toLowerCase().email().max(254),
  pickup: text(300).min(2),
  flightNumber: text(20).optional().default(""),
  dropoff: text(300).optional().default(""),
  hours: z.number().int().min(1).max(24).optional(),
  date, time,
  returnTrip: z.boolean().default(false),
  returnDate: date.optional().or(z.literal("")),
  returnTime: time.optional().or(z.literal("")),
  passengers: z.number().int().min(1).max(20),
  luggage: z.number().int().min(0).max(30),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]),
  childSeats: z.number().int().min(0).max(4).default(0),
  exchangeStop: z.boolean().default(false),
  ferryPeople: z.number().int().min(0).max(20).default(0),
});
export type FormAnswers = z.infer<typeof formAnswersSchema>;

export type FormService = "transfer" | "hourly" | "tour";
export const FORM_LINK_DAYS = 7;

// Koh Kood / Koh Mak trips can add the ferry & hotel transfer.
export const offersFerry = (pickup: string, dropoff: string) => /koh\s*(kood|kut|mak)|เกาะกูด|เกาะหมาก/i.test(`${pickup} ${dropoff}`);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function formToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

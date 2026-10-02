import { z } from "zod";
import { VEHICLES } from "@/lib/vehicles";

// Answers a customer gives on the step-by-step booking form (/f/[token]).
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Enter a real date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
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

// Details the admin (or an agency) fixes in advance; the customer can't change them.
export const formPrefillSchema = z.object({
  pickup: text(300).optional(),
  dropoff: text(300).optional(),
  hours: z.number().int().min(1).max(24).optional(),
  date: date.optional(),
  time: time.optional(),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]).optional(),
  price: z.number().min(0).max(1_000_000).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001).optional(),
});
export type FormPrefill = z.infer<typeof formPrefillSchema>;

/** Drop empty values so only real presets lock fields. */
export function cleanPrefill(p: FormPrefill): FormPrefill {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== "")) as FormPrefill;
}
export const FORM_LINK_DAYS = 7;

// Koh Kood / Koh Mak trips can add the ferry & hotel transfer.
// Koh Chang trips include car ferry tickets, one per seat of the booked vehicle class.
export const includesKohChangFerry = (...places: (string | null | undefined)[]) => /ko(h)?\s*chang|เกาะช้าง/i.test(places.filter(Boolean).join(" "));
export const offersFerry = (pickup: string, dropoff: string) => /koh\s*(kood|kut|mak)|เกาะกูด|เกาะหมาก/i.test(`${pickup} ${dropoff}`);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function formToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

import { z } from "zod";
import { BOOKING_TIMEZONE, bangkokDepartureTimestamp, validBangkokPickup } from "@/lib/booking-time";

export const vehicleIdSchema = z.enum([
  "economy_sedan",
  "comfort_bmw",
  "comfort_suv",
  "premium_minivan",
]);

const placeIdSchema = z.string().trim().min(1).max(300);
const bookingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bookingTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const timezoneSchema = z.literal(BOOKING_TIMEZONE);

export const fareQuoteInputSchema = z.object({
  pickupPlaceId: placeIdSchema,
  dropoffPlaceId: placeIdSchema,
  pickupDate: bookingDateSchema,
  pickupTime: bookingTimeSchema,
  timezone: timezoneSchema,
}).strict().superRefine((input, context) => {
  if (!validBangkokPickup(input.pickupDate, input.pickupTime)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pickupDate"],
      message: "Choose a pickup at least 3 hours from now.",
    });
  }
});

export const hourlyQuoteInputSchema = z.object({
  pickupPlaceId: placeIdSchema,
  bookedHours: z.number().int().min(3).max(12),
  pickupDate: bookingDateSchema,
  pickupTime: bookingTimeSchema,
  timezone: timezoneSchema,
}).strict().superRefine((input, context) => {
  if (!validBangkokPickup(input.pickupDate, input.pickupTime)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pickupDate"],
      message: "Choose a pickup at least 3 hours from now.",
    });
  }
});

export const quoteSummaryInputSchema = z.object({
  outboundQuoteId: z.string().uuid(),
  returnQuoteId: z.string().uuid().optional(),
}).strict();

export const checkoutInputSchema = z.object({
  checkoutAttemptId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerSurname: z.string().trim().min(1).max(80),
  customerEmail: z.string().trim().email().max(254),
  customerPhone: z.string().trim().regex(/^[+0-9() .-]{7,30}$/),
  pickup: z.string().trim().min(2).max(500),
  dropoff: z.string().trim().max(500),
  pickupDate: bookingDateSchema,
  pickupTime: bookingTimeSchema,
  timezone: timezoneSchema,
  passengers: z.number().int().min(1).max(9),
  luggage: z.number().int().min(0).max(12),
  vehicle: vehicleIdSchema,
  flightNumber: z.string().max(30).optional().default(""),
  pickupSign: z.string().max(80).optional().default(""),
  pickupInstructions: z.string().max(500).optional().default(""),
  childSeats: z.number().int().min(0).max(4),
  exchangeStop: z.boolean().optional().default(false),
  ferryHotelPeople: z.number().int().min(0).max(20).optional().default(0),
  saveBilling: z.boolean().optional(),
  copyEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  source: z.string().regex(/^blog:[a-z0-9-]{1,90}$/).optional().catch(undefined),
  taxInvoice: z.object({
    name: z.string().trim().min(2).max(200),
    taxId: z.string().trim().regex(/^\d{13}$/),
    branch: z.string().trim().max(60).optional().default("Head office"),
    address: z.string().trim().min(10).max(500),
  }).strict().optional(),
  oversizedLuggage: z.boolean(),
  specialRequests: z.string().max(500).optional().default(""),
  termsAccepted: z.literal(true),
  paymentMethod: z.enum(["card", "cash"]),
  serviceType: z.enum(["transfer", "hourly"]).default("transfer"),
  fareQuoteId: z.string().uuid().optional(),
  returnFareQuoteId: z.string().uuid().optional(),
  promoCode: z.string().trim().max(40).optional(),
  returnDate: bookingDateSchema.optional(),
  returnTime: bookingTimeSchema.optional(),
  bookedHours: z.number().int().min(3).max(12).optional(),
  hourlyQuoteId: z.string().uuid().optional(),
}).strict().superRefine((input, context) => {
  if (!validBangkokPickup(input.pickupDate, input.pickupTime)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupDate"], message: "Choose a pickup at least 3 hours from now." });
  }
  if (input.serviceType === "transfer") {
    if (input.dropoff.length < 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["dropoff"], message: "Choose a destination." });
    if (!input.fareQuoteId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["fareQuoteId"], message: "Calculate your route before checkout." });
    const returnValues = [input.returnFareQuoteId, input.returnDate, input.returnTime];
    const hasReturn = returnValues.some(Boolean);
    if (hasReturn && !returnValues.every(Boolean)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["returnFareQuoteId"], message: "Complete the return journey details before checkout." });
    }
    if (hasReturn && input.returnDate && input.returnTime) {
      const outbound = bangkokDepartureTimestamp(input.pickupDate, input.pickupTime);
      const returning = bangkokDepartureTimestamp(input.returnDate, input.returnTime);
      if (outbound === null || returning === null || returning <= outbound) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["returnDate"], message: "Choose a return date and time after your departure." });
      }
    }
  }
  if (input.serviceType === "hourly" && (!input.hourlyQuoteId || !input.bookedHours)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["hourlyQuoteId"], message: "Calculate your hourly price before checkout." });
  }
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export function validationError(result: z.SafeParseError<unknown>) {
  const issue = result.error.issues[0];
  return {
    code: "INVALID_BOOKING_DETAILS",
    error: issue?.message ?? "Check your booking details and try again.",
    field: issue?.path.join(".") || undefined,
    retryable: false,
  };
}

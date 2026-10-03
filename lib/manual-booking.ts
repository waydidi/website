import { partnerDb, partnerRate, rateProblem } from "./partner-portal";
import { toSatang } from "./money";
import { ACCEPTED_CANCELLATION_POLICY } from "./accepted-policy";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookings, promoRedemptions } from "@/db/schema";
import { addonsTotal } from "@/lib/addons";
import { uniqueBookingReference } from "@/lib/booking-reference-server";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import { secureToken, sha256 } from "@/lib/security";
import { VEHICLES } from "@/lib/vehicles";
import { OVERTIME_RATES, type HourlyVehicle } from "@/lib/hourly-policy";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);

export const manualBookingSchema = z.object({
  serviceType: z.enum(["transfer", "hourly", "tour"]),
  pickup: text(300).min(2),
  dropoff: text(300).optional().default(""),
  bookedHours: z.number().int().min(1).max(24).optional(),
  pickupDate: date, pickupTime: time,
  returnDate: date.optional().or(z.literal("")), returnTime: time.optional().or(z.literal("")),
  flightNumber: text(20).optional().default(""),
  customerName: text(100).min(1), customerSurname: text(100).optional().default(""),
  customerEmail: z.string().trim().toLowerCase().email().max(254),
  customerPhone: text(40).min(5),
  passengers: z.number().int().min(1).max(20), luggage: z.number().int().min(0).max(30),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]),
  fare: z.number().min(0).max(1_000_000).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001),
  childSeats: z.number().int().min(0).max(4).default(0),
  exchangeStop: z.boolean().default(false),
  ferryPeople: z.number().int().min(0).max(20).default(0),
  discount: z.number().int().min(0).max(1_000_000).default(0),
  paid: z.boolean(),
  pickupSign: text(80).optional().default(""),
  specialRequests: text(400).optional().default(""),
  sendEmail: z.boolean().default(false),
  partnerRateId:z.string().max(80).optional(),
  partnerFormToken:z.string().max(30).optional(),
  agencyId: z.string().max(60).optional().default(""),
});

export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/** Checks the rules a parsed manual booking must meet; returns an error message or null. */
export function manualBookingProblem(b: ManualBookingInput) {
  if (b.serviceType !== "hourly" && b.dropoff.length < 2) return b.serviceType === "tour" ? "Enter the tour name." : "Enter the drop-off.";
  if (b.serviceType === "hourly" && !b.bookedHours) return "Enter the number of hours.";
  if (b.serviceType === "hourly" && (b.vehicle === "comfort_bmw" || (b.bookedHours ?? 0) < 3)) return "By the Hour starts at 3 hours and does not offer BMW.";
  return null;
}

// Saves a booking taken by phone, LINE or an agency as a normal confirmed booking
// (source "manual"), so it shows everywhere and gets the same PDF and email.
export async function createManualBooking(b: ManualBookingInput, origin: string) {
  const agency=b.agencyId?await partnerDb().prepare("SELECT id FROM agency_applications WHERE id=? AND status='approved'").bind(b.agencyId).first():null;
  if(b.agencyId&&!agency)throw new Error("An approved partner account is required.");
  const terms=b.partnerFormToken?await partnerDb().prepare("SELECT * FROM partner_request_terms WHERE form_token=? AND agency_id=?").bind(b.partnerFormToken,b.agencyId).first<{rate_id:string|null;commission_bps:number}>():null;
  const rateId=terms?.rate_id??b.partnerRateId;
  const rate=rateId?await partnerRate(rateId,b.agencyId):null;
  if(rateId&&!rate)throw new Error("Partner rate not found.");
  if(rate){const problem=rateProblem(rate,b);if(problem)throw new Error(problem);if(toSatang(b.fare)!==rate.price_minor||b.discount)throw new Error("Use the exact negotiated fare without an additional discount.");}
  const hasReturn = Boolean(b.returnDate && b.returnTime) && b.serviceType === "transfer";

  const addons = addonsTotal(b.childSeats, b.exchangeStop, undefined, b.ferryPeople);
  const discount = Math.min(b.discount, b.fare);
  const baseMinor=Math.max(0,toSatang(b.fare)-toSatang(discount));
  const total = (baseMinor+toSatang(addons))/100;
  const reference = await uniqueBookingReference();
  const now = new Date().toISOString();
  const requests = [
    b.exchangeStop ? "Currency exchange stop requested." : "",
    b.ferryPeople > 0 ? `Ferry & hotel transfer requested for ${b.ferryPeople}.` : "",
    b.specialRequests,
  ].filter(Boolean).join(" ").slice(0, 500);
  const vehicle = VEHICLES[b.vehicle as keyof typeof VEHICLES];
  // Same private confirmation link a website booking gets.
  const accessToken = secureToken();
  const confirmationUrl = `${origin}/booking/confirmation/${reference}?token=${accessToken}`;

  const bookingInsert=getDb().insert(bookings).values({
    reference,
    customerName: `${b.customerName} ${b.customerSurname}`.trim(),
    customerSurname: b.customerSurname || null,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    pickup: b.pickup,
    dropoff: b.serviceType === "hourly" ? "Flexible itinerary — hourly service" : b.dropoff,
    pickupDate: b.pickupDate, pickupTime: b.pickupTime,
    passengers: b.passengers, luggage: b.luggage,
    flightNumber: b.flightNumber || null,
    pickupSign: b.pickupSign || null,
    childSeats: b.childSeats,
    specialRequests: requests || null,
    vehicle: vehicle.name,
    paymentMethod: b.paid || total === 0 ? "manual" : "cash",
    total,
    status: "confirmed",
    paymentStatus: b.paid || total === 0 ? "paid" : "cash_due",
    paymentStatusUpdatedAt: now,
    reconciliationStatus: "not_required",
    termsAcceptedAt: now,
    policyVersion: ACCEPTED_CANCELLATION_POLICY.version,
    accessTokenHash: await sha256(accessToken),
    emailStatus: "pending",
    fulfillmentStatus: "pending",
    createdAt: now, updatedAt: now,
    serviceType: b.serviceType,
    bookedHours: b.serviceType === "hourly" ? b.bookedHours : null,
    extraHourRate: b.serviceType === "hourly" ? OVERTIME_RATES[b.vehicle as HourlyVehicle] : null,
    extraDistanceRate: b.serviceType === "hourly" ? 0 : null,
    pricingVersion: b.serviceType === "hourly" ? 2 : null,
    scheduledEndAt: b.serviceType === "hourly" && b.bookedHours ? new Date(new Date(`${b.pickupDate}T${b.pickupTime}:00+07:00`).getTime() + b.bookedHours * 3600_000).toISOString() : null,
    returnPickup: hasReturn ? b.dropoff : null,
    returnDropoff: hasReturn ? b.pickup : null,
    returnDate: hasReturn ? b.returnDate : null,
    returnTime: hasReturn ? b.returnTime : null,
  }).toSQL();
  const profile=b.agencyId?await partnerDb().prepare("SELECT commission_bps FROM partner_profiles WHERE agency_id=?").bind(b.agencyId).first<{commission_bps:number}>():null;
  const writes=[partnerDb().prepare(bookingInsert.sql).bind(...bookingInsert.params),
    partnerDb().prepare("INSERT INTO booking_sources(booking_reference,source,created_at) VALUES(?,?,?)").bind(reference,b.agencyId?`agency:${b.agencyId}`:"manual",now),
    partnerDb().prepare("INSERT INTO booking_policy_snapshots(booking_reference,version,policy_json,accepted_at) VALUES(?,?,?,?)").bind(reference,ACCEPTED_CANCELLATION_POLICY.version,JSON.stringify(ACCEPTED_CANCELLATION_POLICY),now)];
  if(b.agencyId)writes.push(partnerDb().prepare("INSERT INTO partner_booking_terms(booking_reference,agency_id,commission_base_minor,commission_bps,rate_snapshot,created_at) VALUES(?,?,?,?,?,?)").bind(reference,b.agencyId,baseMinor,terms?.commission_bps??profile?.commission_bps??0,rate?JSON.stringify(rate):null,now));
  if(b.partnerFormToken)writes.push(partnerDb().prepare("UPDATE booking_forms SET status='booked',booking_reference=? WHERE token=? AND agency_id IS ? AND booking_reference IS NULL").bind(reference,b.partnerFormToken,b.agencyId||null));
  await partnerDb().batch(writes);
  if (discount > 0) await getDb().insert(promoRedemptions).values({
    id: crypto.randomUUID(), promoId: "manual", code: "Exclusive discount", bookingReference: reference,
    customerEmail: b.customerEmail, customerPhone: b.customerPhone,
    originalTotal: b.fare, discount, finalTotal: b.fare - discount, createdAt: now,
  }).catch(() => undefined);

  let emailStatus = "not_sent";
  if (b.sendEmail) {
    const [row] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    emailStatus = (await fulfillBooking(row)).emailStatus;
  } else {
    await getDb().update(bookings).set({ emailStatus: "not_sent", fulfillmentStatus: "complete", updatedAt: now }).where(eq(bookings.reference, reference));
  }
  return { reference, total, emailStatus, confirmationUrl };
}

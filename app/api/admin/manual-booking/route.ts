import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { bookingSources, bookings, promoRedemptions } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { addonsTotal } from "@/lib/addons";
import { uniqueBookingReference } from "@/lib/booking-reference-server";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import { isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";
import { tripPinForReference, tripPinHash } from "@/lib/trip-pin";
import { VEHICLES } from "@/lib/vehicles";

const POLICY_VERSION = "2026-09-07";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);

const schema = z.object({
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
  fare: z.number().int().min(0).max(1_000_000),
  childSeats: z.number().int().min(0).max(4).default(0),
  exchangeStop: z.boolean().default(false),
  ferryPeople: z.number().int().min(0).max(20).default(0),
  discount: z.number().int().min(0).max(1_000_000).default(0),
  paid: z.boolean(),
  pickupSign: text(80).optional().default(""),
  specialRequests: text(400).optional().default(""),
  sendEmail: z.boolean().default(false),
});

// Admin: record a booking taken by phone, LINE or an agency. Saved as a normal
// confirmed booking (source "manual"), so it shows everywhere and gets the same PDF.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Check ${String(issue?.path?.[0] ?? "the form")}: ${issue?.message ?? "invalid value"}.` }, { status: 400 });
  }
  const b = parsed.data;
  if (b.serviceType !== "hourly" && b.dropoff.length < 2) return NextResponse.json({ error: b.serviceType === "tour" ? "Enter the tour name." : "Enter the drop-off." }, { status: 400 });
  if (b.serviceType === "hourly" && !b.bookedHours) return NextResponse.json({ error: "Enter the number of hours." }, { status: 400 });
  const hasReturn = Boolean(b.returnDate && b.returnTime) && b.serviceType === "transfer";

  const addons = addonsTotal(b.childSeats, b.exchangeStop, undefined, b.ferryPeople);
  const discount = Math.min(b.discount, b.fare);
  const total = Math.max(0, b.fare - discount) + addons;
  const reference = await uniqueBookingReference();
  const now = new Date().toISOString();
  const requests = [
    b.exchangeStop ? "Currency exchange stop requested." : "",
    b.ferryPeople > 0 ? `Ferry & hotel transfer requested for ${b.ferryPeople}.` : "",
    b.specialRequests,
  ].filter(Boolean).join(" ").slice(0, 500);
  const vehicle = VEHICLES[b.vehicle as keyof typeof VEHICLES];

  await getDb().insert(bookings).values({
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
    policyVersion: POLICY_VERSION,
    accessTokenHash: await sha256(secureToken()),
    tripPinHash: await tripPinHash(reference, await tripPinForReference(reference)),
    tripPinCreatedAt: now,
    emailStatus: "pending",
    fulfillmentStatus: "pending",
    createdAt: now, updatedAt: now,
    serviceType: b.serviceType,
    bookedHours: b.serviceType === "hourly" ? b.bookedHours : null,
    scheduledEndAt: b.serviceType === "hourly" && b.bookedHours ? new Date(new Date(`${b.pickupDate}T${b.pickupTime}:00+07:00`).getTime() + b.bookedHours * 3600_000).toISOString() : null,
    returnPickup: hasReturn ? b.dropoff : null,
    returnDropoff: hasReturn ? b.pickup : null,
    returnDate: hasReturn ? b.returnDate : null,
    returnTime: hasReturn ? b.returnTime : null,
  });
  await getDb().insert(bookingSources).values({ bookingReference: reference, source: "manual", createdAt: now }).catch(() => undefined);
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
  return NextResponse.json({ ok: true, reference, total, emailStatus });
}

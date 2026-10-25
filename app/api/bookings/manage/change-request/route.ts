import { revisedBookingTotal, validChangedSchedule } from "@/lib/booking-change";
import { validTransferPrice } from "@/lib/booking-quote-check";
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingChangeRequests, fareQuotes } from "@/db/schema";
import { managedBooking, canManageStatus, HOUR, pickupInstant } from "@/lib/booking-management";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { VEHICLES, vehicleFits } from "@/lib/vehicles";
import { insertBookingChange, sameChangeSubmission } from "@/lib/booking-change-submit";
import { toSatang } from "@/lib/money";
import { logOperationalError, requestIdFor } from "@/lib/observability";

const inputSchema = z.object({
  fareQuoteId: z.string().min(1).max(200), returnFareQuoteId: z.string().min(1).max(200).optional(),
  vehicleId: z.string().min(1).max(60), bookingVersion: z.number().int().min(1),
  reason: z.string().trim().max(300).optional(), requestId: z.string().uuid().optional(),
  preview: z.boolean().default(false), expectedRevisedTotalMinor: z.number().int().min(0).max(100000000).optional(),
}).strict();

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const booking = await managedBooking(request);
  if (!booking) return NextResponse.json({ error: "Your management session expired." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Calculate the revised journey before submitting." }, { status: 400 });
  const input = parsed.data;
  if (input.requestId && !input.preview) {
    const [existing] = await getDb().select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, input.requestId)).limit(1);
    if (existing) {
      if (existing.bookingReference !== booking.reference || !sameChangeSubmission(existing, input)) return NextResponse.json({ error: "This request ID was already used for different details." }, { status: 409 });
      return NextResponse.json({ ok: true, reused: true, requestId: existing.id, status: existing.status, revisedTotal: existing.revisedTotal, priceDifference: existing.priceDifference }, { headers: { "Cache-Control": "no-store" } });
    }
  }
  if (!canManageStatus(booking.status) || pickupInstant(booking.pickupDate, booking.pickupTime) - Date.now() < 72 * HOUR) {
    return NextResponse.json({ error: "Online journey changes close 72 hours before pickup." }, { status: 409 });
  }
  if (booking.bookingVersion !== input.bookingVersion) return NextResponse.json({ error: "This booking changed in another session. Refresh and try again." }, { status: 409 });
  const vehicleId = input.vehicleId as keyof typeof VEHICLES;
  const vehicle = VEHICLES[vehicleId];
  if (!vehicle) return NextResponse.json({ error: "Choose an available vehicle." }, { status: 400 });
  if (!vehicleFits(vehicleId, booking.passengers, booking.luggage)) {
    return NextResponse.json({ error: `The ${vehicle.name} carries up to ${vehicle.passengers} passengers and ${vehicle.bags} bags. Choose a larger vehicle.` }, { status: 400 });
  }
  const [quote] = await getDb().select().from(fareQuotes).where(eq(fareQuotes.id, input.fareQuoteId)).limit(1);
  if (!quote) return NextResponse.json({ error: "The revised route price is unavailable. Calculate it again." }, { status: 409 });
  if(!await validTransferPrice(quote,vehicleId)) return NextResponse.json({error:"The revised route quote expired or its price changed."},{status:409});
  const requestedDate = quote.departureDate;
  const requestedTime = quote.departureTime;
  if (!requestedDate || !requestedTime) return NextResponse.json({ error: "The revised departure time is unavailable. Calculate it again." }, { status: 409 });
  if (!validChangedSchedule(requestedDate, requestedTime, booking.returnDate, booking.returnTime)) return NextResponse.json({ error: "The return journey must be after the outbound pickup." }, { status: 409 });
  const prices = JSON.parse(quote.vehiclePricesJson) as Record<string, { total: number }>;
  const revisedPrice = prices[vehicleId];
  if (!revisedPrice || !Number.isInteger(revisedPrice.total)) return NextResponse.json({ error: "This vehicle is unavailable for the revised route." }, { status: 409 });
  let returnQuote: typeof quote | null = null;
  let revisedTotal = revisedPrice.total;
  if (booking.returnDate && booking.returnTime) {
    if (typeof input.returnFareQuoteId !== "string") return NextResponse.json({ error: "Calculate the revised return journey before submitting." }, { status: 400 });
    const [foundReturnQuote] = await getDb().select().from(fareQuotes).where(eq(fareQuotes.id, input.returnFareQuoteId)).limit(1);
    returnQuote = foundReturnQuote ?? null;
    if (!returnQuote || returnQuote.pickupPlaceId !== quote.dropoffPlaceId || returnQuote.dropoffPlaceId !== quote.pickupPlaceId || returnQuote.departureDate !== booking.returnDate || returnQuote.departureTime !== booking.returnTime) {
      return NextResponse.json({ error: "The revised return journey does not match this booking." }, { status: 409 });
    }
    if(!await validTransferPrice(returnQuote,vehicleId)) return NextResponse.json({error:"The revised return quote expired or its price changed."},{status:409});
    const returnPrices = JSON.parse(returnQuote.vehiclePricesJson) as Record<string, { total: number }>;
    const returnPrice = returnPrices[vehicleId];
    if (!returnPrice || !Number.isInteger(returnPrice.total)) return NextResponse.json({ error: "This vehicle is unavailable for the revised return route." }, { status: 409 });
    revisedTotal += returnPrice.total;
  }
  revisedTotal = await revisedBookingTotal(booking, revisedTotal);
  const revisedTotalMinor = toSatang(revisedTotal);
  if (input.preview) return NextResponse.json({ originalTotalMinor: toSatang(booking.total), revisedTotalMinor, priceDifferenceMinor: revisedTotalMinor - toSatang(booking.total), bookingVersion: booking.bookingVersion }, { headers: { "Cache-Control": "private, no-store" } });
  if (input.expectedRevisedTotalMinor !== undefined && input.expectedRevisedTotalMinor !== revisedTotalMinor) return NextResponse.json({ error: "The revised total changed. Review the new price before submitting." }, { status: 409 });
  const [pending] = await getDb().select().from(bookingChangeRequests).where(and(eq(bookingChangeRequests.bookingReference, booking.reference), eq(bookingChangeRequests.status, "pending"))).limit(1);
  if (pending) {
    if (input.requestId === pending.id && sameChangeSubmission(pending, input)) return NextResponse.json({ ok: true, reused: true, requestId: pending.id, status: pending.status, revisedTotal: pending.revisedTotal, priceDifference: pending.priceDifference });
    return NextResponse.json({ error: "A journey-change request is already awaiting review." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const id = input.requestId ?? crypto.randomUUID();
  const priceDifference = revisedTotal - booking.total;
  let inserted: boolean;
  try { inserted = await insertBookingChange(env.DB, {
    id,
    bookingReference: booking.reference,
    pickup: quote.pickupText,
    dropoff: quote.dropoffText,
    pickupPlaceId: quote.pickupPlaceId,
    dropoffPlaceId: quote.dropoffPlaceId,
    pickupDate: requestedDate,
    pickupTime: requestedTime,
    vehicleId,
    vehicleName: vehicle.name,
    fareQuoteId: quote.id,
    returnFareQuoteId: returnQuote?.id,
    distanceMeters: quote.distanceMeters,
    durationSeconds: quote.durationSeconds,
    originalTotal: booking.total,
    revisedTotal,
    priceDifference,
    reason: typeof input.reason === "string" ? input.reason.trim().slice(0, 300) || null : null,
    bookingVersion: booking.bookingVersion,
    createdAt: now,
  }); } catch (error) {
    logOperationalError("booking_change_submit_failed", requestIdFor(request), error);
    return NextResponse.json({ error: "Your request could not be confirmed. Refresh the booking and retry the same request." }, { status: 503 });
  }
  if (!inserted) {
    const [existing] = await getDb().select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, id)).limit(1);
    if (existing?.bookingReference === booking.reference && sameChangeSubmission(existing, input)) return NextResponse.json({ ok: true, reused: true, requestId: existing.id, status: existing.status, revisedTotal: existing.revisedTotal, priceDifference: existing.priceDifference });
    return NextResponse.json({ error: "This booking, quote or pending request changed. Refresh before submitting again." }, { status: 409 });
  }
  await import("@/lib/telegram/booking-changes").then((m) => m.notifyChangeRequest(id)).catch((error) => logOperationalError("booking_change_notify_failed", requestIdFor(request), error));
  return NextResponse.json({ ok: true, requestId: id, status: "pending", revisedTotal, priceDifference }, { headers: { "Cache-Control": "private, no-store" } });
}

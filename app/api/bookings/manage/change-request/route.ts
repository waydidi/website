import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingChangeRequests, fareQuotes, operationsAlerts } from "@/db/schema";
import { managedBooking, canManageStatus, HOUR, pickupInstant } from "@/lib/booking-management";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { VEHICLES, vehicleFits } from "@/lib/vehicles";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const booking = await managedBooking(request);
  if (!booking) return NextResponse.json({ error: "Your management session expired." }, { status: 401 });
  if (!canManageStatus(booking.status) || pickupInstant(booking.pickupDate, booking.pickupTime) - Date.now() < 72 * HOUR) {
    return NextResponse.json({ error: "Online journey changes close 72 hours before pickup." }, { status: 409 });
  }
  const input = await request.json() as { fareQuoteId?: unknown; returnFareQuoteId?: unknown; vehicleId?: unknown; bookingVersion?: unknown; reason?: unknown };
  if (typeof input.fareQuoteId !== "string" || typeof input.vehicleId !== "string" || !Number.isInteger(input.bookingVersion)) {
    return NextResponse.json({ error: "Calculate the revised journey before submitting." }, { status: 400 });
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
  const requestedDate = quote.departureDate;
  const requestedTime = quote.departureTime;
  if (!requestedDate || !requestedTime) return NextResponse.json({ error: "The revised departure time is unavailable. Calculate it again." }, { status: 409 });
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
    const returnPrices = JSON.parse(returnQuote.vehiclePricesJson) as Record<string, { total: number }>;
    const returnPrice = returnPrices[vehicleId];
    if (!returnPrice || !Number.isInteger(returnPrice.total)) return NextResponse.json({ error: "This vehicle is unavailable for the revised return route." }, { status: 409 });
    revisedTotal += returnPrice.total;
  }
  const [pending] = await getDb().select().from(bookingChangeRequests).where(and(eq(bookingChangeRequests.bookingReference, booking.reference), eq(bookingChangeRequests.status, "pending"))).limit(1);
  if (pending) return NextResponse.json({ error: "A journey-change request is already awaiting review." }, { status: 409 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const priceDifference = revisedTotal - booking.total;
  await getDb().insert(bookingChangeRequests).values({
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
  });
  await getDb().insert(operationsAlerts).values({
    id: crypto.randomUUID(),
    bookingReference: booking.reference,
    alertType: "customer_journey_change",
    severity: "warning",
    title: "Customer journey-change request",
    details: `${booking.pickup} → ${booking.dropoff} requested as ${quote.pickupText} → ${quote.dropoffText}. Price difference: THB ${priceDifference}.`,
    dedupeKey: `journey-change:${id}`,
    status: "open",
    detectedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ ok: true, requestId: id, status: "pending", revisedTotal, priceDifference });
}

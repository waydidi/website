import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { fareQuotes } from "@/db/schema";
import { DEMO_PICKUP, demoTripFor } from "@/lib/demo-route";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Without Google Maps: the sample routes (Suvarnabhumi → Pattaya / Koh Kood) are
// saved as real fare quotes so they can be booked like any other route.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = await request.json().catch(() => null) as { pickup?: string; dropoff?: string; date?: string; time?: string; returnDate?: string; returnTime?: string; distanceMeters?: number; durationSeconds?: number } | null;
  const pickup = String(input?.pickup ?? "").trim().slice(0, 300), dropoff = String(input?.dropoff ?? "").trim().slice(0, 300);
  const trip = demoTripFor(pickup, dropoff);
  const okDate = (d?: string) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? ""), okTime = (t?: string) => /^\d{2}:\d{2}$/.test(t ?? "");
  if (!trip || !okDate(input?.date) || !okTime(input?.time)) return NextResponse.json({ error: "This route can't be priced online yet." }, { status: 400 });
  const prices = JSON.stringify(Object.fromEntries(Object.entries(trip.prices).map(([id, total]) => [id, { total, basePrice: total, distanceSurcharge: 0 }])));
  const meters = Number.isFinite(input?.distanceMeters) && input!.distanceMeters! > 0 ? Math.round(input!.distanceMeters!) : trip.fallbackMeters;
  const seconds = Number.isFinite(input?.durationSeconds) && input!.durationSeconds! > 0 ? Math.round(input!.durationSeconds!) : trip.fallbackSeconds;
  const now = new Date().toISOString(), expiresAt = new Date(Date.now() + 2 * 3600_000).toISOString();
  const row = (id: string, from: string, to: string, fromId: string, toId: string, a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }, date: string, time: string) => ({
    id, pickupPlaceId: fromId, dropoffPlaceId: toId, pickupText: from, dropoffText: to, areaId: `sample-${trip.id}`, areaName: `Sample route (${trip.id})`,
    distanceMeters: meters, durationSeconds: seconds, pickupLatitude: a.latitude, pickupLongitude: a.longitude, dropoffLatitude: b.latitude, dropoffLongitude: b.longitude,
    vehiclePricesJson: prices, pricingVersion: 1, departureDate: date, departureTime: time, timezone: "Asia/Bangkok", expiresAt, createdAt: now,
  });
  const fromId = "sample:suvarnabhumi", toId = `sample:${trip.id}`;
  const quoteId = crypto.randomUUID();
  await getDb().insert(fareQuotes).values(row(quoteId, pickup, dropoff, fromId, toId, DEMO_PICKUP, trip.dropoff, input!.date!, input!.time!));
  let returnQuoteId: string | null = null;
  if (okDate(input?.returnDate) && okTime(input?.returnTime)) {
    returnQuoteId = crypto.randomUUID();
    await getDb().insert(fareQuotes).values(row(returnQuoteId, dropoff, pickup, toId, fromId, trip.dropoff, DEMO_PICKUP, input!.returnDate!, input!.returnTime!));
  }
  return NextResponse.json({ quoteId, returnQuoteId });
}

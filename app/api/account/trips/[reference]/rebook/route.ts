import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { fareQuotes, hourlyQuotes } from "@/db/schema";
import { customerBooking, customerFromRequest } from "@/lib/customer-auth";
import { rebookQuery } from "@/lib/customer-account";

// Opens the homepage search form pre-filled from one of the customer's trips:
// ?mode=again repeats the route, ?mode=return reverses it.
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const url = new URL(request.url);
  const { reference } = await context.params;
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.redirect(new URL(`/account/sign-in?next=${encodeURIComponent(`/account/trips/${reference}`)}`, url));
  const trip = await customerBooking(session.customer, reference.toUpperCase());
  if (!trip) return NextResponse.redirect(new URL("/account/trips", url));
  const mode = url.searchParams.get("mode") === "return" ? "return" : "again";
  let places: { pickupPlaceId: string; dropoffPlaceId: string } | null = null;
  if (trip.serviceType === "hourly" && trip.hourlyQuoteId) {
    const [quote] = await getDb().select({ pickupPlaceId: hourlyQuotes.pickupPlaceId }).from(hourlyQuotes).where(eq(hourlyQuotes.id, trip.hourlyQuoteId)).limit(1);
    if (quote) places = { pickupPlaceId: quote.pickupPlaceId, dropoffPlaceId: "" };
  } else if (trip.fareQuoteId) {
    const [quote] = await getDb().select({ pickupPlaceId: fareQuotes.pickupPlaceId, dropoffPlaceId: fareQuotes.dropoffPlaceId }).from(fareQuotes).where(eq(fareQuotes.id, trip.fareQuoteId)).limit(1);
    if (quote) places = quote;
  }
  return NextResponse.redirect(new URL(rebookQuery(trip, places, mode), url), { headers: { "Cache-Control": "no-store" } });
}

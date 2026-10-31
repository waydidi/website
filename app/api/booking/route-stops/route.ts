import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fareQuotes } from "@/db/schema";
import { sameOrigin, isJsonRequest } from "@/lib/security";
import { validTransferQuote } from "@/lib/quote-validity";
import { listRouteStopOffers } from "@/lib/route-stops-db";
import { selectRouteStops } from "@/lib/route-stops";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const headers = { "Cache-Control": "no-store" };
  if ((env as unknown as Record<string, unknown>).ROUTE_STOPS !== "1") return NextResponse.json({ offers: [] }, { headers });
  let body: { quoteId?: unknown } | null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body.quoteId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.quoteId)) return NextResponse.json({ error: "A quote ID is required" }, { status: 400 });
  const quote = await getDb().query.fareQuotes.findFirst({ where: eq(fareQuotes.id, body.quoteId) });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (!validTransferQuote(quote)) return NextResponse.json({ error: "Quote expired" }, { status: 409 });
  const pickup = quote.pickupLatitude == null || quote.pickupLongitude == null ? null : { lat: quote.pickupLatitude, lng: quote.pickupLongitude };
  const dropoff = quote.dropoffLatitude == null || quote.dropoffLongitude == null ? null : { lat: quote.dropoffLatitude, lng: quote.dropoffLongitude };
  const offers = await listRouteStopOffers();
  return NextResponse.json({ offers: offers.filter(offer => {
    try { return selectRouteStops(true, [offer.id], offers, pickup, dropoff).length === 1; }
    catch { return false; }
  }).map(({ id, name, photo, durationMinutes, priceMinor }) => ({ id, name, photo, durationMinutes, priceMinor })) }, { headers });
}

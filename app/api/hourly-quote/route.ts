import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { hourlyQuotes } from "@/db/schema";
import { hourlyQuoteInputSchema, validationError } from "@/lib/booking-validation";
import { hourlyPrices } from "@/lib/hourly-pricing";
import { matchPublishedArea } from "@/lib/pricing";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { logOperationalError, monitoredHeaders, requestIdFor } from "@/lib/observability";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
  if (!env.GOOGLE_MAPS_SERVER_KEY) return NextResponse.json({error:"Hourly pricing is awaiting Google Maps configuration"},{status:503});
  const parsed = hourlyQuoteInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(validationError(parsed),{status:400});
  const input = parsed.data;
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(input.pickupPlaceId)}`, {headers:{"X-Goog-Api-Key":env.GOOGLE_MAPS_SERVER_KEY,"X-Goog-FieldMask":"id,formattedAddress,location"}});
    if (!response.ok) throw new Error("PLACE_LOOKUP_FAILED");
    const place = await response.json() as {id:string;formattedAddress?:string;location?:{latitude:number;longitude:number}};
    if (!place.location) throw new Error("PLACE_LOCATION_MISSING");
    const area = await matchPublishedArea({lat:place.location.latitude,lng:place.location.longitude});
    const prices = await hourlyPrices(area?.id ?? null, input.bookedHours);
    const id=crypto.randomUUID(), now=new Date(), expiresAt="9999-12-31T23:59:59.999Z";
    await getDb().insert(hourlyQuotes).values({id,pickupPlaceId:place.id,pickupText:place.formattedAddress??"Pickup",pickupLatitude:place.location.latitude,pickupLongitude:place.location.longitude,areaId:area?.id,areaName:area?.name??"Thailand hourly service",bookedHours:input.bookedHours,vehiclePricesJson:JSON.stringify(prices),pricingVersion:area?.version??1,departureDate:input.pickupDate,departureTime:input.pickupTime,timezone:input.timezone,expiresAt,createdAt:now.toISOString()});
    return NextResponse.json({quoteId:id,area:{id:area?.id??"ANY",name:area?.name??"Thailand hourly service",color:area?.color??"#FF8A05"},bookedHours:input.bookedHours,prices,expiresAt});
  } catch (error) {
    logOperationalError("hourly_quote.failed", requestId, error);
    return NextResponse.json(
      { code: "HOURLY_QUOTE_UNAVAILABLE", error: "We could not price this hourly booking. Please try again.", retryable: true, requestId },
      { status: 503, headers: monitoredHeaders(requestId, startedAt) },
    );
  }
}

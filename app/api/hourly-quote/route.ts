import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { hourlyQuotes } from "@/db/schema";
import { hourlyQuoteInputSchema, validationError } from "@/lib/booking-validation";
import { hourlyPrices } from "@/lib/hourly-pricing";
import { areaHourlyPrices, HOURLY_MAX_HOURS } from "@/lib/hourly-area-pricing";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
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
    const lookup = async (placeId: string) => {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {headers:{"X-Goog-Api-Key":env.GOOGLE_MAPS_SERVER_KEY,"X-Goog-FieldMask":"id,formattedAddress,location"}});
      if (!response.ok) throw new Error("PLACE_LOOKUP_FAILED");
      const found = await response.json() as {id:string;formattedAddress?:string;location?:{latitude:number;longitude:number}};
      if (!found.location) throw new Error("PLACE_LOCATION_MISSING");
      return found as {id:string;formattedAddress?:string;location:{latitude:number;longitude:number}};
    };
    const [place, dropoff] = await Promise.all([lookup(input.pickupPlaceId), input.dropoffPlaceId ? lookup(input.dropoffPlaceId) : null]);
    // A chosen city prices by that city's hourly rates, wherever the pickup is.
    if (input.areaSlug) {
      const city = HOURLY_AREAS.find((a) => a.slug === input.areaSlug);
      if (input.bookedHours > HOURLY_MAX_HOURS || !city) return NextResponse.json({error:"Choose an area and up to 10 hours."},{status:400});
      const prices = await areaHourlyPrices(city.slug, input.bookedHours);
      if (!prices || !Object.keys(prices).length) return NextResponse.json({error:`Hourly service in ${city.name} isn't available right now.`},{status:409});
      const id=crypto.randomUUID(), expiresAt="9999-12-31T23:59:59.999Z";
      await getDb().insert(hourlyQuotes).values({id,pickupPlaceId:place.id,pickupText:place.formattedAddress??"Pickup",pickupLatitude:place.location.latitude,pickupLongitude:place.location.longitude,areaId:city.slug,areaName:city.name,bookedHours:input.bookedHours,dropoffText:dropoff?.formattedAddress??null,dropoffLatitude:dropoff?.location.latitude??null,dropoffLongitude:dropoff?.location.longitude??null,vehiclePricesJson:JSON.stringify(prices),pricingVersion:1,departureDate:input.pickupDate,departureTime:input.pickupTime,timezone:input.timezone,expiresAt,createdAt:new Date().toISOString()});
      return NextResponse.json({quoteId:id,area:{id:city.slug,name:city.name,color:"#FF8A05"},bookedHours:input.bookedHours,prices,expiresAt,
        pickup:{lat:place.location.latitude,lng:place.location.longitude,text:place.formattedAddress??"Pickup"},
        dropoff:dropoff?{lat:dropoff.location.latitude,lng:dropoff.location.longitude,text:dropoff.formattedAddress??"Drop-off"}:null});
    }
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

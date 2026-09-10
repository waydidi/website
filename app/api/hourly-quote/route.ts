import { env } from "cloudflare:workers";
import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { hourlyQuotes } from "@/db/schema";
import { hourlyPrices } from "@/lib/hourly-pricing";
import { matchPublishedArea } from "@/lib/pricing";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
  if (!env.GOOGLE_MAPS_SERVER_KEY) return NextResponse.json({error:"Hourly pricing is awaiting Google Maps configuration"},{status:503});
  const input = await request.json() as { pickupPlaceId?:string; bookedHours?:number };
  if (!input.pickupPlaceId || input.pickupPlaceId.length > 300 || !Number.isInteger(input.bookedHours) || input.bookedHours! < 3 || input.bookedHours! > 12) return NextResponse.json({error:"Select a pickup and 3–12 hours"},{status:400});
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(input.pickupPlaceId)}`, {headers:{"X-Goog-Api-Key":env.GOOGLE_MAPS_SERVER_KEY,"X-Goog-FieldMask":"id,formattedAddress,location"}});
    if (!response.ok) throw new Error("PLACE_LOOKUP_FAILED");
    const place = await response.json() as {id:string;formattedAddress?:string;location?:{latitude:number;longitude:number}};
    if (!place.location) throw new Error("PLACE_LOCATION_MISSING");
    const area = await matchPublishedArea({lat:place.location.latitude,lng:place.location.longitude});
    const prices = await hourlyPrices(area?.id ?? null, input.bookedHours!);
    const id=crypto.randomUUID(), now=new Date(), expires=new Date(now.getTime()+20*60*1000);
    await getDb().delete(hourlyQuotes).where(lt(hourlyQuotes.expiresAt,new Date(Date.now()-86400000).toISOString()));
    await getDb().insert(hourlyQuotes).values({id,pickupPlaceId:place.id,pickupText:place.formattedAddress??"Pickup",pickupLatitude:place.location.latitude,pickupLongitude:place.location.longitude,areaId:area?.id,areaName:area?.name??"Thailand hourly service",bookedHours:input.bookedHours!,vehiclePricesJson:JSON.stringify(prices),pricingVersion:area?.version??1,expiresAt:expires.toISOString(),createdAt:now.toISOString()});
    return NextResponse.json({quoteId:id,area:{id:area?.id??"ANY",name:area?.name??"Thailand hourly service",color:area?.color??"#FF8A05"},bookedHours:input.bookedHours,prices,expiresAt:expires.toISOString()});
  } catch (error) { console.error("Hourly quote failed",error); return NextResponse.json({error:"We could not price this hourly booking. Please try again."},{status:503}); }
}

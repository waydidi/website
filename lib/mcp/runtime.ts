import { env } from "cloudflare:workers";
import { POST as transfer } from "../../app/api/fare-quote/route";
import { POST as hourly } from "../../app/api/hourly-quote/route";
import { hourlyCityAt } from "../hourly-policy";
import { quoteWith, type ResolvedPlace } from "./quote";
import type { QuoteInput } from "./schemas";

type Place = { id: string; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText?: string; shortText?: string; types?: string[] }[] };
async function resolve(text: string): Promise<ResolvedPlace> {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("MAPS_UNAVAILABLE");
  const id = text.startsWith("place_id:") ? text.slice(9) : null;
  const response = await fetch(id ? `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}` : "https://places.googleapis.com/v1/places:searchText", {
    method: id ? "GET" : "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": id ? "id,formattedAddress,location,addressComponents" : "places.id,places.formattedAddress,places.location,places.addressComponents" },
    ...(id ? {} : { body: JSON.stringify({ textQuery: text, regionCode: "TH", languageCode: "en", pageSize: 1, locationRestriction: { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } } }) }),
  });
  if (!response.ok) throw new Error("PLACE_UNAVAILABLE");
  const data = await response.json() as Place & { places?: Place[] };
  const place = id ? data : data.places?.[0];
  if (!place?.id || !place.location) throw new Error("PLACE_NOT_FOUND");
  return { id: place.id, text: place.formattedAddress ?? text, areaSlug: hourlyCityAt({ lat: place.location.latitude, lng: place.location.longitude, addressComponents: place.addressComponents }) };
}
export const publicQuote = (input: QuoteInput, ip = "unknown") => quoteWith(input, { resolve, transfer, hourly }, ip);

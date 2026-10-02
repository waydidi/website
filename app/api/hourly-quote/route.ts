import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { withSeason } from "@/lib/seasons";
import { getDb } from "@/db";
import { hourlyQuotes } from "@/db/schema";
import { hourlyQuoteInputSchema, validationError } from "@/lib/booking-validation";
import { areaHourlyPrices, hourlyAreaSettings } from "@/lib/hourly-area-pricing";
import { hourlyCityPairSettings, cityPairPrices } from "@/lib/hourly-city-pricing";
import { approvedHourlyPair, hourlyCityAt, CITY_TO_CITY_MIN_HOURS, HOURLY_POLICY_VERSION, HOURLY_QUOTE_MINUTES } from "@/lib/hourly-policy";
import { bangkokDepartureIso } from "@/lib/booking-time";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { allowHourlyRequest } from "@/lib/hourly-request-limit";
import { logOperationalError, monitoredHeaders, requestIdFor } from "@/lib/observability";

type Place = { id: string; formattedAddress?: string; addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]; location: { latitude: number; longitude: number } };
function operationsQuote(reason: string) {
  return NextResponse.json({ code: "HOURLY_OPERATIONS_QUOTE", error: reason, manualReview: true }, { status: 422 });
}
export async function POST(request: Request) {
  const startedAt = Date.now(), requestId = requestIdFor(request);
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = hourlyQuoteInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(validationError(parsed), { status: 400 });
  const input = parsed.data;
  const selected = HOURLY_AREAS.find((a) => a.slug === input.areaSlug);
  if (!selected) return NextResponse.json({ error: "Choose a service area." }, { status: 400 });
  try {
    if (!await allowHourlyRequest(request, "quote")) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    const settings = await hourlyAreaSettings();
    const serviceArea = settings.find((a) => a.slug === selected.slug && a.active);
    if (!serviceArea) return NextResponse.json({ code: "HOURLY_UNAVAILABLE", error: "This service area is unavailable." }, { status: 409 });
    if (!input.pickupPlaceId || !env.GOOGLE_MAPS_SERVER_KEY) return operationsQuote("Operations will verify your addresses and confirm the itinerary price before payment.");
    // An unresolved typed destination must never disappear from the quote.
    if (input.dropoffText?.trim() && !input.dropoffPlaceId) return operationsQuote("Please select your destination from the suggestions, or request an operations quote.");
    const lookup = async (placeId: string): Promise<Place> => {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY!, "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("PLACE_LOOKUP_FAILED");
      const place = await response.json() as Place;
      if (!place.location || !Number.isFinite(place.location.latitude) || !Number.isFinite(place.location.longitude)) throw new Error("PLACE_LOCATION_MISSING");
      return place;
    };
    const [pickup, dropoff] = await Promise.all([lookup(input.pickupPlaceId), input.dropoffPlaceId ? lookup(input.dropoffPlaceId) : null]);
    const cityOf = (p: Place) => hourlyCityAt({ lat: p.location.latitude, lng: p.location.longitude, addressComponents: p.addressComponents });
    const origin = cityOf(pickup), destination = dropoff ? cityOf(dropoff) : origin;
    if (!origin || !destination) return operationsQuote("This destination needs an operations quote.");
    if (!dropoff && origin !== selected.slug) return operationsQuote("Add a destination so operations can verify an itinerary outside your selected service area.");
    const cityToCity = origin !== destination;
    const pair = cityToCity ? approvedHourlyPair(origin, destination) : null;
    if (cityToCity && !pair) return operationsQuote("This city pair is not available for instant booking. Operations will confirm your price.");
    const hours = cityToCity ? Math.max(CITY_TO_CITY_MIN_HOURS, input.bookedHours) : input.bookedHours;
    const endpointAreas = [origin, destination].map((slug) => settings.find((a) => a.slug === slug)).filter((a) => a !== undefined);
    if (endpointAreas.some((a) => !a.active)) return operationsQuote("This itinerary needs availability confirmation from operations.");
    let distanceMeters: number | null = null, durationSeconds: number | null = null, routePolyline: string | null = null;
    let prices;
    if (pair && dropoff) {
      const pairSetting = (await hourlyCityPairSettings()).find((p) => p.id === pair.id)!;
      if (!pairSetting.active) return operationsQuote("This city pair needs an operations quote.");
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" },
        body: JSON.stringify({ origin: { location: { latLng: pickup.location } }, destination: { location: { latLng: dropoff.location } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE_OPTIMAL", departureTime: bangkokDepartureIso(input.pickupDate, input.pickupTime), trafficModel: "BEST_GUESS", computeAlternativeRoutes: false }),
      });
      if (!response.ok) return operationsQuote("Operations will review the travel time and confirm your price.");
      const data = await response.json() as { routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[] };
      const route = data.routes?.[0];
      distanceMeters = route?.distanceMeters ?? null;
      durationSeconds = route?.duration ? Math.ceil(Number.parseFloat(route.duration)) : null;
      routePolyline = route?.polyline?.encodedPolyline ?? null;
      if (!distanceMeters || !durationSeconds || !Number.isFinite(durationSeconds)) return operationsQuote("Operations will review this route before quoting.");
      // The default cap is the six-hour base package; operations can lower it per pair.
      if (durationSeconds > pairSetting.maxDrivingMinutes * 60 || durationSeconds > hours * 3600) return operationsQuote("This route is unusually long for the package. Operations will confirm your itinerary and price.");
      prices = cityPairPrices(pairSetting, hours);
    } else {
      prices = await areaHourlyPrices(origin, hours);
    }
    if (prices) prices = await withSeason(prices, input.pickupDate, { service: "hourly", areaId: origin });
    if (prices) prices = Object.fromEntries(Object.entries(prices).filter(([v]) => serviceArea.rates[v as keyof typeof serviceArea.rates]?.active && endpointAreas.every((a) => a.rates[v as keyof typeof a.rates]?.active)));
    if (!prices || !Object.keys(prices).length) return operationsQuote("Operations will confirm vehicle availability for this itinerary.");
    const id = crypto.randomUUID(), now = new Date(), expiresAt = new Date(now.getTime() + HOURLY_QUOTE_MINUTES * 60000).toISOString();
    const areaName = pair?.name ?? HOURLY_AREAS.find((a) => a.slug === origin)?.name ?? origin;
    await getDb().insert(hourlyQuotes).values({ id, pickupPlaceId: pickup.id, pickupText: pickup.formattedAddress ?? "Pickup", pickupLatitude: pickup.location.latitude, pickupLongitude: pickup.location.longitude,
      areaId: selected.slug, areaName, pricingAreaSlug: origin, cityPairId: pair?.id ?? null, bookedHours: hours,
      dropoffText: dropoff?.formattedAddress ?? null, dropoffLatitude: dropoff?.location.latitude ?? null, dropoffLongitude: dropoff?.location.longitude ?? null,
      vehiclePricesJson: JSON.stringify(prices), pricingVersion: HOURLY_POLICY_VERSION, departureDate: input.pickupDate, departureTime: input.pickupTime, timezone: input.timezone,
      routeDistanceMeters: distanceMeters, routeDurationSeconds: durationSeconds, routePolyline, expiresAt, createdAt: now.toISOString() });
    return NextResponse.json({ quoteId: id, area: { id: selected.slug, name: areaName, color: "#FF8A05" }, serviceArea: selected.name, cityPairId: pair?.id ?? null, bookedHours: hours, cityToCity, prices, expiresAt,
      inclusions: { unlimitedKilometres: true, tollsIncluded: true, overtimeGraceMinutes: 15 }, distanceMeters, averageDurationMinutes: durationSeconds ? Math.max(5, Math.round(durationSeconds / 300) * 5) : null,
      pickup: { lat: pickup.location.latitude, lng: pickup.location.longitude, text: pickup.formattedAddress ?? "Pickup" },
      dropoff: dropoff ? { lat: dropoff.location.latitude, lng: dropoff.location.longitude, text: dropoff.formattedAddress ?? "Destination" } : null });
  } catch (error) {
    logOperationalError("hourly_quote.failed", requestId, error);
    return NextResponse.json({ code: "HOURLY_QUOTE_UNAVAILABLE", error: "We could not price this hourly booking. Please try again.", retryable: true, requestId }, { status: 503, headers: monitoredHeaders(requestId, startedAt) });
  }
}

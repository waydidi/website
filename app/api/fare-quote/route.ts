import { env } from "cloudflare:workers";
import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkoutAttempts, fareQuotes } from "@/db/schema";
import { BOOKING_TIMEZONE, bangkokDepartureIso } from "@/lib/booking-time";
import { fareQuoteInputSchema, validationError } from "@/lib/booking-validation";
import { matchPublishedArea, pricesForArea } from "@/lib/pricing";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { loadInclusions } from "@/lib/route-inclusions-db";
import { logOperationalError, monitoredHeaders, requestIdFor } from "@/lib/observability";

type Place = {
  id: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
};

async function getPlace(placeId: string, key: string) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,formattedAddress,location",
      },
    },
  );
  if (!response.ok) throw new Error("PLACE_LOOKUP_FAILED");
  return response.json() as Promise<Place>;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  if (!sameOrigin(request) || !isJsonRequest(request))
    return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!env.GOOGLE_MAPS_SERVER_KEY)
    return NextResponse.json(
      { error: "Route pricing is awaiting Google Maps configuration" },
      { status: 503 },
    );
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const fingerprint = await sha256(
    `fare:${env.RATE_LIMIT_SALT ?? "waydidi"}:${address}`,
  );
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [{ attempts }] = await getDb()
    .select({ attempts: count() })
    .from(checkoutAttempts)
    .where(
      and(
        eq(checkoutAttempts.fingerprintHash, fingerprint),
        gt(checkoutAttempts.createdAt, since),
      ),
    );
  if (attempts > 80)
    return NextResponse.json(
      { error: "Too many route requests. Please try again shortly." },
      { status: 429 },
    );
  await getDb()
    .insert(checkoutAttempts)
    .values({
      fingerprintHash: fingerprint,
      createdAt: new Date().toISOString(),
    });
  const parsed = fareQuoteInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(validationError(parsed), { status: 400 });
  const input = parsed.data;
  try {
    const [pickup, dropoff] = await Promise.all([
      getPlace(input.pickupPlaceId, env.GOOGLE_MAPS_SERVER_KEY),
      getPlace(input.dropoffPlaceId, env.GOOGLE_MAPS_SERVER_KEY),
    ]);
    if (!pickup.location || !dropoff.location)
      throw new Error("PLACE_LOCATION_MISSING");
    const area = await matchPublishedArea({
      lat: dropoff.location.latitude,
      lng: dropoff.location.longitude,
    });
    if (!area || area.pricingType === "manual")
      return NextResponse.json(
        { error: "This destination needs a custom quote", manualReview: true },
        { status: 422 },
      );
    const departureTime = bangkokDepartureIso(input.pickupDate, input.pickupTime)!;
    const routeResponse = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: pickup.location.latitude,
                longitude: pickup.location.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: dropoff.location.latitude,
                longitude: dropoff.location.longitude,
              },
            },
          },
          travelMode: "DRIVE",
          routingPreference: departureTime ? "TRAFFIC_AWARE_OPTIMAL" : "TRAFFIC_AWARE",
          ...(departureTime ? { departureTime, trafficModel: "BEST_GUESS" } : {}),
        }),
      },
    );
    if (!routeResponse.ok) throw new Error("ROUTE_LOOKUP_FAILED");
    const routeData = (await routeResponse.json()) as {
      routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }>;
    };
    const route = routeData.routes?.[0];
    if (!route?.distanceMeters || !route.duration)
      throw new Error("ROUTE_NOT_FOUND");
    const durationSeconds = Math.round(
      Number.parseFloat(route.duration.replace("s", "")),
    );
    const prices = await pricesForArea(area.id, route.distanceMeters);
    const inclusions = await loadInclusions(
      { lat: pickup.location.latitude, lng: pickup.location.longitude },
      { lat: dropoff.location.latitude, lng: dropoff.location.longitude },
    );
    if (Object.keys(prices).length !== 4)
      return NextResponse.json(
        { error: "This area is missing vehicle prices", manualReview: true },
        { status: 422 },
      );
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = "9999-12-31T23:59:59.999Z";
    await getDb()
      .insert(fareQuotes)
      .values({
        id,
        pickupPlaceId: pickup.id,
        dropoffPlaceId: dropoff.id,
        pickupText: pickup.formattedAddress ?? "Pickup",
        dropoffText: dropoff.formattedAddress ?? "Destination",
        areaId: area.id,
        areaName: area.name,
        distanceMeters: route.distanceMeters,
        durationSeconds,
        routePolyline: route.polyline?.encodedPolyline ?? null,
        pickupLatitude: pickup.location.latitude,
        pickupLongitude: pickup.location.longitude,
        dropoffLatitude: dropoff.location.latitude,
        dropoffLongitude: dropoff.location.longitude,
        vehiclePricesJson: JSON.stringify(prices),
        pricingVersion: area.version,
        departureDate: input.pickupDate,
        departureTime: input.pickupTime,
        timezone: input.timezone,
        expiresAt,
        createdAt: now.toISOString(),
      });
    return NextResponse.json({
      quoteId: id,
      area: {
        id: area.id,
        name: area.name,
        color: area.color,
        pricingType: area.pricingType,
      },
      distanceMeters: route.distanceMeters,
      durationSeconds,
      averageDurationMinutes: Math.max(5, Math.round(durationSeconds / 300) * 5),
      encodedPolyline: route.polyline?.encodedPolyline ?? "",
      pickup: pickup.location,
      dropoff: dropoff.location,
      departure: {
        localDate: input.pickupDate,
        localTime: input.pickupTime,
        timezone: BOOKING_TIMEZONE,
      },
      prices,
      inclusions,
      expiresAt,
    });
  } catch (error) {
    logOperationalError("fare_quote.failed", requestId, error);
    return NextResponse.json(
      { code: "FARE_QUOTE_UNAVAILABLE", error: "We could not price this route. Please try again.", retryable: true, requestId },
      { status: 503, headers: monitoredHeaders(requestId, startedAt) },
    );
  }
}

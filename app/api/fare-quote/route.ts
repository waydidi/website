import { env } from "cloudflare:workers";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkoutAttempts, fareQuotes } from "@/db/schema";
import { matchPublishedArea, pricesForArea } from "@/lib/pricing";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

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
  const input = (await request.json()) as {
    pickupPlaceId?: string;
    dropoffPlaceId?: string;
  };
  if (
    !input.pickupPlaceId ||
    !input.dropoffPlaceId ||
    input.pickupPlaceId.length > 300 ||
    input.dropoffPlaceId.length > 300
  )
    return NextResponse.json(
      { error: "Select both locations from Google Maps" },
      { status: 400 },
    );
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
    const routeResponse = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
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
          routingPreference: "TRAFFIC_AWARE",
        }),
      },
    );
    if (!routeResponse.ok) throw new Error("ROUTE_LOOKUP_FAILED");
    const routeData = (await routeResponse.json()) as {
      routes?: Array<{ distanceMeters?: number; duration?: string }>;
    };
    const route = routeData.routes?.[0];
    if (!route?.distanceMeters || !route.duration)
      throw new Error("ROUTE_NOT_FOUND");
    const durationSeconds = Math.round(
      Number.parseFloat(route.duration.replace("s", "")),
    );
    const prices = await pricesForArea(area.id, route.distanceMeters);
    if (Object.keys(prices).length !== 4)
      return NextResponse.json(
        { error: "This area is missing vehicle prices", manualReview: true },
        { status: 422 },
      );
    const id = crypto.randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + 20 * 60 * 1000);
    await getDb()
      .delete(fareQuotes)
      .where(
        lt(
          fareQuotes.expiresAt,
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        ),
      );
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
        pickupLatitude: pickup.location.latitude,
        pickupLongitude: pickup.location.longitude,
        dropoffLatitude: dropoff.location.latitude,
        dropoffLongitude: dropoff.location.longitude,
        vehiclePricesJson: JSON.stringify(prices),
        pricingVersion: area.version,
        expiresAt: expires.toISOString(),
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
      prices,
      expiresAt: expires.toISOString(),
    });
  } catch (error) {
    console.error("Fare quote failed", error);
    return NextResponse.json(
      { error: "We could not price this route. Please try again." },
      { status: 503 },
    );
  }
}

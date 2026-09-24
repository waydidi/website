import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { isThailandPoint, type SpeedInterval } from "@/lib/traffic";

const TTL_SECONDS = 30 * 60;

type RouteResponse = {
  routes?: Array<{
    duration?: string;
    polyline?: { encodedPolyline?: string };
    travelAdvisory?: { speedReadingIntervals?: Array<{ startPolylinePointIndex?: number; endPolylinePointIndex?: number; speed?: SpeedInterval["speed"] }> };
  }>;
};

// Current traffic along a route, reused for 30 minutes per pickup/drop-off pair.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const key = (env as unknown as Record<string, string | undefined>).GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "Live traffic is awaiting Google Maps configuration" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { pickup?: unknown; dropoff?: unknown } | null;
  if (!isThailandPoint(body?.pickup) || !isThailandPoint(body?.dropoff)) return NextResponse.json({ error: "Invalid route" }, { status: 400 });
  const { pickup, dropoff } = body as { pickup: { latitude: number; longitude: number }; dropoff: { latitude: number; longitude: number } };

  const round = (n: number) => n.toFixed(4);
  const cacheKey = new Request(new URL(`/api/route-traffic/cache/${round(pickup.latitude)},${round(pickup.longitude)}/${round(dropoff.latitude)},${round(dropoff.longitude)}`, request.url).toString());
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cached = await cache?.match(cacheKey).catch(() => undefined);
  if (cached) return cached;

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.speedReadingIntervals",
    },
    body: JSON.stringify({
      origin: { location: { latLng: pickup } },
      destination: { location: { latLng: dropoff } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      extraComputations: ["TRAFFIC_ON_POLYLINE"],
      polylineQuality: "HIGH_QUALITY",
    }),
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ error: "Traffic is unavailable" }, { status: 502 });
  const route = ((await response.json()) as RouteResponse).routes?.[0];
  if (!route?.polyline?.encodedPolyline) return NextResponse.json({ error: "Traffic is unavailable" }, { status: 502 });
  const intervals: SpeedInterval[] = (route.travelAdvisory?.speedReadingIntervals ?? []).map((i) => ({ start: i.startPolylinePointIndex ?? 0, end: i.endPolylinePointIndex ?? 0, speed: i.speed ?? "NORMAL" }));
  const result = NextResponse.json(
    { encodedPolyline: route.polyline.encodedPolyline, intervals, durationSeconds: Math.round(Number.parseFloat((route.duration ?? "0").replace("s", ""))), fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": `public, max-age=${TTL_SECONDS}` } },
  );
  await cache?.put(cacheKey, result.clone()).catch(() => undefined);
  return result;
}

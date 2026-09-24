import { env } from "cloudflare:workers";
import { ETA_CACHE_SECONDS } from "@/lib/customer-trip-rules";

type Point = { latitude: number; longitude: number };
export type TripEta = { minutes: number; target: "pickup" | "dropoff"; computedAt: string };

function workerCache() {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Driving time from the car to the pickup or drop-off, from the Google Routes
 * API. One lookup per assignment and target every 2 minutes keeps many
 * viewers of the same trip inside the free tier.
 */
export async function tripEta(input: { assignmentId: string; target: "pickup" | "dropoff"; from: Point; to: Point }): Promise<TripEta | null> {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  const cache = workerCache();
  const cacheKey = new Request(`https://eta.waydidi.internal/${encodeURIComponent(input.assignmentId)}/${input.target}`);
  const cached = await cache?.match(cacheKey).catch(() => undefined);
  if (cached) return (await cached.json()) as TripEta;

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration" },
    body: JSON.stringify({
      origin: { location: { latLng: input.from } },
      destination: { location: { latLng: input.to } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { routes?: Array<{ duration?: string }> };
  const seconds = Number.parseInt(data.routes?.[0]?.duration ?? "", 10);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const eta: TripEta = { minutes: Math.max(1, Math.round(seconds / 60)), target: input.target, computedAt: new Date().toISOString() };
  await cache?.put(cacheKey, new Response(JSON.stringify(eta), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ETA_CACHE_SECONDS}` } })).catch(() => undefined);
  return eta;
}

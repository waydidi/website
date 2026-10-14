import { env } from "cloudflare:workers";

// Where a driver's step photo was taken: a Google Maps link (always) and the nearest named place (when Google can say).

export const mapsUrl = (latitude: number, longitude: number) => `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

type Nearby = { places?: { displayName?: { text?: string }; formattedAddress?: string }[] };

/**
 * The closest named place within 150 m of a point (Google Places, the same server key as the price and place
 * lookups). Never throws: no key, a refused key, no place nearby or a slow answer all give null, and the post
 * still carries the Maps link. Turn the lookup off with TELEGRAM_PHOTO_PLACE_NAME=0.
 */
export async function nearestPlace(latitude: number, longitude: number): Promise<{ name: string; address: string } | null> {
  const settings = env as unknown as Record<string, string | undefined>;
  const key = settings.GOOGLE_MAPS_SERVER_KEY;
  if (!key || settings.TELEGRAM_PHOTO_PLACE_NAME === "0") return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST", signal: AbortSignal.timeout(2500),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.formattedAddress" },
      body: JSON.stringify({ maxResultCount: 1, rankPreference: "DISTANCE", languageCode: "en", regionCode: "TH", locationRestriction: { circle: { center: { latitude, longitude }, radius: 150 } } }),
    });
    if (!res.ok) { console.error("photo place lookup failed", res.status); return null; }
    const place = ((await res.json()) as Nearby).places?.[0];
    const name = place?.displayName?.text?.trim();
    return name ? { name, address: place?.formattedAddress?.trim() ?? "" } : null;
  } catch (error) {
    console.error("photo place lookup failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

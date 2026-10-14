import { env } from "cloudflare:workers";

// Where a driver's step photo was taken: the exact point the camera stamped on the picture, a Google Maps link to
// that point, and (when Google can say) the address of that point and the nearest named place.

const six = (n: number) => n.toFixed(6);
/** Opens Google Maps with a pin on exactly this point. */
export const mapsUrl = (latitude: number, longitude: number) => `https://www.google.com/maps/search/?api=1&query=${six(latitude)},${six(longitude)}`;

/** Metres between two points. */
export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export type LocationInfo = { address: string | null; nearest: { name: string; distanceM: number } | null };
const escHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The Telegram lines for a photo's location: the stamped coordinates, the address, the nearest place, the Maps link. */
export function locationLines(latitude: number, longitude: number, accuracyM: number | null, info: LocationInfo | null) {
  return [
    `📍 <b>${six(latitude)}, ${six(longitude)}</b>${accuracyM != null ? ` (±${Math.round(accuracyM)} m)` : ""}`,
    ...(info?.address ? [escHtml(info.address)] : []),
    ...(info?.nearest ? [`Nearest place: <b>${escHtml(info.nearest.name)}</b> (about ${Math.max(5, Math.round(info.nearest.distanceM / 5) * 5)} m away)`] : []),
    mapsUrl(latitude, longitude),
  ];
}

type Settings = Record<string, string | undefined>;
/** The last failed lookup is kept so a setup problem (API not enabled for the key) is visible. */
async function noteFailure(what: string, detail: string) {
  console.error("photo location lookup failed", what, detail.slice(0, 200));
  await (env.DB as unknown as { prepare: (s: string) => { bind: (...v: unknown[]) => { run: () => Promise<unknown> } } })
    .prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('photo_location_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(`${what}: ${detail}`.slice(0, 400), new Date().toISOString()).run().catch(() => undefined);
}

/** The address of the exact point (Google reverse geocoding). Null when unavailable; never throws. */
async function addressOf(latitude: number, longitude: number, key: string) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${six(latitude)},${six(longitude)}&language=en&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(2500) });
    const body = (await res.json().catch(() => ({}))) as { status?: string; error_message?: string; results?: { formatted_address?: string }[] };
    if (!res.ok || (body.status && body.status !== "OK" && body.status !== "ZERO_RESULTS")) { await noteFailure("geocoding", `${res.status} ${body.status ?? ""} ${body.error_message ?? ""}`); return null; }
    return body.results?.[0]?.formatted_address?.trim() || null;
  } catch (error) { await noteFailure("geocoding", error instanceof Error ? error.message : "unknown"); return null; }
}

/** The closest named place within 150 m, with how far it is from the point. Null when unavailable; never throws. */
async function nearestNamedPlace(latitude: number, longitude: number, key: string) {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST", signal: AbortSignal.timeout(2500),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.location" },
      body: JSON.stringify({ maxResultCount: 1, rankPreference: "DISTANCE", languageCode: "en", regionCode: "TH", locationRestriction: { circle: { center: { latitude, longitude }, radius: 150 } } }),
    });
    if (!res.ok) { await noteFailure("places", `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`); return null; }
    const place = ((await res.json()) as { places?: { displayName?: { text?: string }; location?: { latitude: number; longitude: number } }[] }).places?.[0];
    const name = place?.displayName?.text?.trim();
    if (!name) return null;
    return { name, distanceM: place?.location ? distanceMetres({ latitude, longitude }, place.location) : 0 };
  } catch (error) { await noteFailure("places", error instanceof Error ? error.message : "unknown"); return null; }
}

/** Address and nearest place for a point, looked up together (about 2.5 s at most). Turn off with TELEGRAM_PHOTO_PLACE_NAME=0. */
export async function describeLocation(latitude: number, longitude: number): Promise<LocationInfo | null> {
  const settings = env as unknown as Settings;
  const key = settings.GOOGLE_MAPS_SERVER_KEY;
  if (!key || settings.TELEGRAM_PHOTO_PLACE_NAME === "0") return null;
  const [address, nearest] = await Promise.all([addressOf(latitude, longitude, key), nearestNamedPlace(latitude, longitude, key)]);
  return address || nearest ? { address, nearest } : null;
}

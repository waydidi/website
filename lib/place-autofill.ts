import { env } from "cloudflare:workers";
import { putFile } from "@/lib/file-store";
import { hoursFromGoogle, type GooglePeriod, type PlaceHours } from "@/lib/google-hours";
import { commonsPhotos, isCommonsFileUrl, type FreePhoto } from "@/lib/place-autofill-rules";

// Admin → Attractions: "Fill from Google Maps" (name, address, location, opening hours) and "Find free photos"
// (Wikimedia Commons, free licences only, imported into Waydidi's own file store with their credit).

export type GooglePlaceFacts = { placeId: string; name: string; address: string; lat: number; lng: number; hours: PlaceHours | null };

const THAILAND = { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } };
const FIELDS = "id,displayName,formattedAddress,location,regularOpeningHours.periods";
type GPlace = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; regularOpeningHours?: { periods?: GooglePeriod[] } };

/** The place on Google Maps, by its place id (picked in the Location box) or, failing that, by its name. */
export async function googlePlaceFacts(input: { placeId?: string | null; query?: string | null }): Promise<GooglePlaceFacts | null> {
  const key = (env as unknown as Record<string, string | undefined>).GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": key };
  let place: GPlace | undefined;
  if (input.placeId) {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}?languageCode=en`, { headers: { ...headers, "X-Goog-FieldMask": FIELDS }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (res?.ok) place = await res.json().catch(() => undefined) as GPlace | undefined;
  }
  if (!place && input.query) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { ...headers, "X-Goog-FieldMask": FIELDS.split(",").map((f) => `places.${f}`).join(",") },
      body: JSON.stringify({ textQuery: input.query.slice(0, 200), regionCode: "TH", languageCode: "en", pageSize: 1, locationRestriction: THAILAND }), signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (res?.ok) place = ((await res.json().catch(() => ({}))) as { places?: GPlace[] }).places?.[0];
  }
  const lat = place?.location?.latitude, lng = place?.location?.longitude, name = place?.displayName?.text?.trim();
  if (!place?.id || !name || typeof lat !== "number" || typeof lng !== "number") return null;
  return { placeId: place.id, name: name.slice(0, 120), address: (place.formattedAddress ?? "").slice(0, 300), lat, lng, hours: hoursFromGoogle(place.regularOpeningHours?.periods) };
}

// Wikimedia asks API users to identify themselves.
const COMMONS_HEADERS = { "User-Agent": "WaydidiBot/1.0 (https://waydidi.com)", "Api-User-Agent": "WaydidiBot/1.0 (https://waydidi.com)" };
const IMAGE_PROPS = { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600", iiextmetadatafilter: "LicenseShortName|Artist", format: "json", formatversion: "1", origin: "*" };

async function commons(params: Record<string, string>) {
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", ...IMAGE_PROPS, ...params })}`, { headers: COMMONS_HEADERS, signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.ok ? res.json().catch(() => null) : null;
}

/** Free photos of the place: taken within 500 m of it, and files named after it. */
export async function findFreePhotos(input: { name: string; lat?: number | null; lng?: number | null }): Promise<FreePhoto[]> {
  const near = input.lat != null && input.lng != null
    ? commons({ generator: "geosearch", ggscoord: `${input.lat}|${input.lng}`, ggsradius: "500", ggslimit: "40", ggsnamespace: "6" }) : Promise.resolve(null);
  const named = input.name.trim().length >= 3 ? commons({ generator: "search", gsrsearch: `${input.name.trim().slice(0, 100)} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "30" }) : Promise.resolve(null);
  const seen = new Set<string>(), out: FreePhoto[] = [];
  for (const answer of await Promise.all([near, named])) for (const p of commonsPhotos(answer)) if (!seen.has(p.url)) { seen.add(p.url); out.push(p); }
  return out.slice(0, 30);
}

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

/** Copies a chosen Commons photo into the file store (like an uploaded photo). Only Wikimedia's image server, images, up to 5 MB. */
export async function importFreePhoto(url: string): Promise<string | null> {
  if (!isCommonsFileUrl(url)) return null;
  const res = await fetch(url, { headers: COMMONS_HEADERS, redirect: "error", signal: AbortSignal.timeout(15000) }).catch(() => null);
  const type = (res?.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!res?.ok || !TYPES[type] || Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  const bytes = await res.arrayBuffer().catch(() => null);
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
  const name = `${crypto.randomUUID()}.${TYPES[type]}`;
  await putFile(`blog/${name}`, bytes, type);
  return `/api/blog-images/${name}`;
}

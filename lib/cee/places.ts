import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";
import { findPlace } from "./quotes";

// Live recommendations for Non: real restaurants, cafés, markets, attractions… from Google Maps,
// with ratings and opening status. Only facts Google returns are passed on; Non never invents them.

export type FoundPlace = { name: string; kind: string | null; rating: number | null; reviews: number | null; price: string | null; address: string; openNow: boolean | null; mapsUrl: string; photo: string | null; summary: string | null; distanceKm: number | null };
type GPlace = { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; priceLevel?: string; googleMapsUri?: string;
  location?: { latitude: number; longitude: number }; primaryTypeDisplayName?: { text?: string }; currentOpeningHours?: { openNow?: boolean }; photos?: { name: string }[]; editorialSummary?: { text?: string } };
const PRICE: Record<string, string> = { PRICE_LEVEL_INEXPENSIVE: "฿", PRICE_LEVEL_MODERATE: "฿฿", PRICE_LEVEL_EXPENSIVE: "฿฿฿", PRICE_LEVEL_VERY_EXPENSIVE: "฿฿฿฿" };
// A failed place search is not a reason to involve the team.
const NO_RESULTS = "Live place search isn't available right now. Don't hand over. Apologise briefly, give any general tips you're sure of for that area (no made-up names, ratings or opening hours), and offer to drive them there or plan the day.";
const salt = () => String((env as unknown as Record<string, string>).RATE_LIMIT_SALT ?? "waydidi");

/** Signed photo link (so the photo endpoint can't be used to fetch arbitrary Google photos on our key). */
export const photoSig = async (name: string) => (await sha256(`place-photo:${salt()}:${name}`)).slice(0, 24);
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,600}$/;

export async function findPlaces(query: string, near: string): Promise<{ ok: true; places: FoundPlace[] } | { ok: false; reason: string }> {
  const key = (env as unknown as Record<string, string>).GOOGLE_MAPS_SERVER_KEY;
  if (!key) return { ok: false, reason: NO_RESULTS };
  // A hotel, landmark or address: search around that exact spot (about 2.5 km), nearest good places first.
  const coords = near.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  const center = coords ? null : near ? await findPlace(near).catch(() => null) : null;
  const at = coords ? { latitude: Number(coords[1]), longitude: Number(coords[2]) } : center?.location ?? null;
  const textQuery = at || coords ? query : near ? `${query} near ${near}` : query;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.location,places.primaryTypeDisplayName,places.currentOpeningHours.openNow,places.photos,places.editorialSummary" },
    body: JSON.stringify({ textQuery: textQuery.slice(0, 200), languageCode: "en", regionCode: "TH", pageSize: 10,
      ...(at ? { locationBias: { circle: { center: at, radius: 2500 } } }
        : { locationRestriction: { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } } }) }),
  });
  if (!res.ok) {
    // Kept for Admin → Website chat → Alerts & limits, so a setup problem (API not enabled, key restriction) is visible.
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    console.error("place search failed", res.status, detail);
    await (env.DB as unknown as { prepare: (s: string) => { bind: (...v: unknown[]) => { run: () => Promise<unknown> } } }).prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('place_search_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(JSON.stringify({ status: res.status, detail, at: new Date().toISOString() }), new Date().toISOString()).run().catch(() => undefined);
    return { ok: false, reason: NO_RESULTS };
  }
  const data = await res.json() as { places?: GPlace[] };
  // Well-reviewed places first; Google's own order breaks ties.
  const list = (data.places ?? []).filter((p) => p.displayName?.text && p.googleMapsUri)
    .map((p, i) => { const km = at && p.location ? distanceKm(at, p.location) : null;
      // Close by (within 3 km of the customer's place) and well reviewed first.
      return { p, i, km, score: (km !== null && km > 3 ? 2 : 0) + ((p.rating ?? 0) >= 4 && (p.userRatingCount ?? 0) >= 50 ? 0 : 1) }; })
    .sort((a, b) => a.score - b.score || (a.km ?? 0) - (b.km ?? 0) || a.i - b.i).slice(0, 5);
  const places = await Promise.all(list.map(async ({ p, km }): Promise<FoundPlace> => {
    const photo = p.photos?.[0]?.name;
    return { name: p.displayName!.text!, kind: p.primaryTypeDisplayName?.text ?? null, rating: p.rating ?? null, reviews: p.userRatingCount ?? null,
      price: p.priceLevel ? PRICE[p.priceLevel] ?? null : null, address: p.formattedAddress ?? "", openNow: p.currentOpeningHours?.openNow ?? null,
      mapsUrl: p.googleMapsUri!, summary: p.editorialSummary?.text ?? null, distanceKm: km === null ? null : Math.round(km * 10) / 10,
      photo: photo && PHOTO_NAME.test(photo) ? `/api/places/photo?n=${encodeURIComponent(photo)}&s=${await photoSig(photo)}` : null };
  }));
  return places.length ? { ok: true, places } : { ok: false, reason: "Nothing found there. Ask for a different area or kind of place. Don't hand over for this." };
}

/** Straight-line distance in km. */
function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

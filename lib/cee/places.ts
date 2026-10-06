import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";

// Live recommendations for Non: real restaurants, cafés, markets, attractions… from Google Maps,
// with ratings and opening status. Only facts Google returns are passed on; Non never invents them.

export type FoundPlace = { name: string; kind: string | null; rating: number | null; reviews: number | null; price: string | null; address: string; openNow: boolean | null; mapsUrl: string; photo: string | null; summary: string | null };
type GPlace = { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; priceLevel?: string; googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string }; currentOpeningHours?: { openNow?: boolean }; photos?: { name: string }[]; editorialSummary?: { text?: string } };
const PRICE: Record<string, string> = { PRICE_LEVEL_INEXPENSIVE: "฿", PRICE_LEVEL_MODERATE: "฿฿", PRICE_LEVEL_EXPENSIVE: "฿฿฿", PRICE_LEVEL_VERY_EXPENSIVE: "฿฿฿฿" };
const salt = () => String((env as unknown as Record<string, string>).RATE_LIMIT_SALT ?? "waydidi");

/** Signed photo link (so the photo endpoint can't be used to fetch arbitrary Google photos on our key). */
export const photoSig = async (name: string) => (await sha256(`place-photo:${salt()}:${name}`)).slice(0, 24);
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,600}$/;

export async function findPlaces(query: string, near: string): Promise<{ ok: true; places: FoundPlace[] } | { ok: false; reason: string }> {
  const key = (env as unknown as Record<string, string>).GOOGLE_MAPS_SERVER_KEY;
  if (!key) return { ok: false, reason: "Place search isn't connected. Say you'll ask the team, or hand over." };
  const textQuery = near ? `${query} near ${near}` : query;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.primaryTypeDisplayName,places.currentOpeningHours.openNow,places.photos,places.editorialSummary" },
    body: JSON.stringify({ textQuery: textQuery.slice(0, 200), languageCode: "en", regionCode: "TH", pageSize: 10,
      locationRestriction: { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } } }),
  });
  if (!res.ok) return { ok: false, reason: "Place search failed. Say you'll check with the team, or hand over." };
  const data = await res.json() as { places?: GPlace[] };
  // Well-reviewed places first; Google's own order breaks ties.
  const list = (data.places ?? []).filter((p) => p.displayName?.text && p.googleMapsUri)
    .map((p, i) => ({ p, i, score: (p.rating ?? 0) >= 4 && (p.userRatingCount ?? 0) >= 50 ? 0 : 1 }))
    .sort((a, b) => a.score - b.score || a.i - b.i).slice(0, 5).map((x) => x.p);
  const places = await Promise.all(list.map(async (p): Promise<FoundPlace> => {
    const photo = p.photos?.[0]?.name;
    return { name: p.displayName!.text!, kind: p.primaryTypeDisplayName?.text ?? null, rating: p.rating ?? null, reviews: p.userRatingCount ?? null,
      price: p.priceLevel ? PRICE[p.priceLevel] ?? null : null, address: p.formattedAddress ?? "", openNow: p.currentOpeningHours?.openNow ?? null,
      mapsUrl: p.googleMapsUri!, summary: p.editorialSummary?.text ?? null,
      photo: photo && PHOTO_NAME.test(photo) ? `/api/places/photo?n=${encodeURIComponent(photo)}&s=${await photoSig(photo)}` : null };
  }));
  return places.length ? { ok: true, places } : { ok: false, reason: "Nothing found. Ask for a different area or kind of place." };
}

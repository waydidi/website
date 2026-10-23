// The top of a customer's itinerary page: the photo strip made from the trip's own attractions, and what the price
// includes. Pure (no runtime imports) so it is unit tested directly; the page passes in the frozen snapshot stops.

export type PhotoStop = { id: string; name: string; cover: string | null; gallery: string[]; highlights?: string[]; fee?: { included: boolean } | null };
export type TripPhoto = { src: string; stop: string };

const MAX_PHOTOS = 20;
const usable = (src: string | null | undefined): src is string => typeof src === "string" && /^(https:\/\/|\/)/.test(src.trim());

/**
 * Every stop's cover first, in visiting order (so the first photos show the whole day), then the stops' gallery photos
 * taken in turns, one per stop each round. Each picture appears once, at most 20, and only https or site-relative links.
 */
export function tripPhotos(stops: PhotoStop[], max = MAX_PHOTOS): TripPhoto[] {
  const seen = new Set<string>(), out: TripPhoto[] = [];
  const add = (src: string | null | undefined, stop: string) => { if (out.length < max && usable(src) && !seen.has(src.trim())) { seen.add(src.trim()); out.push({ src: src.trim(), stop }); } };
  for (const s of stops) add(s.cover ?? s.gallery[0], s.name);
  for (let round = 0; out.length < max && stops.some((s) => s.gallery.length > round); round++) for (const s of stops) add(s.gallery[round], s.name);
  return out;
}

/**
 * Each stop with its attraction's photos as they are now, so photos staff add after the trip was sent still show; a stop
 * whose attraction has no photos (or is gone) keeps the photos it was sent with. Only photos change: prices, names and
 * times stay as sent.
 */
export function withCurrentPhotos<S extends { id: string; cover: string | null; gallery: string[] }>(stops: S[], attractionOf: Record<string, string | null | undefined>,
  current: Record<string, { coverImage: string | null; gallery: string[] }>): S[] {
  return stops.map((s) => {
    const a = current[attractionOf[s.id] ?? ""];
    return a && (a.coverImage || a.gallery.length) ? { ...s, cover: a.coverImage ?? a.gallery[0] ?? null, gallery: a.coverImage ? a.gallery : a.gallery.slice(1) } : s;
  });
}

/** Highlights grouped by stop, for stops that have any. */
export const tripHighlights = (stops: PhotoStop[]) => stops.filter((s) => (s.highlights ?? []).length > 0).map((s) => ({ stop: s.name, items: s.highlights! }));

/** Names of stops whose entrance ticket is in the price, and of those paid on the day. */
export function ticketStops(stops: PhotoStop[]) {
  const unique = (xs: string[]) => [...new Set(xs)];
  return { included: unique(stops.filter((s) => s.fee?.included).map((s) => s.name)), onSite: unique(stops.filter((s) => s.fee && !s.fee.included).map((s) => s.name)) };
}

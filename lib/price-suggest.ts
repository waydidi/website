import { env } from "cloudflare:workers";
import type { FormAnswers, FormService } from "@/lib/booking-form";
import { demoTripFor } from "@/lib/demo-route";
import { cityOfText } from "@/lib/hourly-area-match";
import { areaHourlyPrices } from "@/lib/hourly-area-pricing";
import { matchPublishedArea, pricesForArea, type Point } from "@/lib/pricing";
import { loadSeasons, seasonalPrice } from "@/lib/seasons";
import { VEHICLES } from "@/lib/vehicles";

// Suggested fare for a customer form, from the same fare areas, distance rules and
// seasons the website uses. The fare excludes add-ons (child seat etc.), which booking adds.
export type PriceSuggestion = { amount: number; detail: string };

const UA = "Waydidi/1.0 (booking price suggestion; support@waydidi.com)";

/** Map point for a typed address: Google when a key is set, otherwise OpenStreetMap. */
async function geocode(address: string): Promise<Point | null> {
  try {
    if (env.GOOGLE_MAPS_SERVER_KEY) {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?region=th&components=country:TH&address=${encodeURIComponent(address)}&key=${env.GOOGLE_MAPS_SERVER_KEY}`, { signal: AbortSignal.timeout(6000) });
      const data = await res.json() as { results?: { geometry?: { location?: { lat: number; lng: number } } }[] };
      const loc = data.results?.[0]?.geometry?.location;
      if (loc) return { lat: loc.lat, lng: loc.lng };
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&q=${encodeURIComponent(address)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    const [hit] = await res.json() as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch { return null; }
}

/** Driving distance in metres (OSRM), or straight-line distance × 1.3 if routing is unavailable. */
async function drivingMeters(a: Point, b: Point) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    const data = await res.json() as { routes?: { distance?: number }[] };
    if (data.routes?.[0]?.distance) return data.routes[0].distance;
  } catch { /* fall through */ }
  const r = 6371000, rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h)) * 1.3;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export async function suggestFormPrice(service: FormService, a: FormAnswers): Promise<PriceSuggestion | null> {
  const seasons = await loadSeasons();
  const vehicleName = VEHICLES[a.vehicle as keyof typeof VEHICLES]?.name ?? a.vehicle;
  const leg = (base: number, date: string, ctx: { service: "transfer" | "hourly"; areaId: string }) => seasonalPrice(base, date, { ...ctx, vehicleId: a.vehicle }, seasons);
  const seasonNote = (names: (string | false | undefined)[]) => { const n = [...new Set(names.filter(Boolean))]; return n.length ? ` · ${n.join(", ")}` : ""; };

  if (service === "hourly") {
    const slug = cityOfText(a.pickup);
    if (!slug || !a.hours) return null;
    const prices = await areaHourlyPrices(slug, a.hours).catch(() => null);
    const base = prices?.[a.vehicle as keyof typeof prices]?.total;
    if (!base) return null;
    const out = leg(base, a.date, { service: "hourly", areaId: slug });
    return { amount: out.total, detail: `${a.hours} h ${slug} · ${vehicleName}${seasonNote([out.total !== base && out.season?.name])}` };
  }
  if (service !== "transfer" || !a.dropoff) return null;

  // Priced sample routes (e.g. Suvarnabhumi → Pattaya) work without any map lookup.
  const demo = demoTripFor(a.pickup, a.dropoff);
  let base: number | undefined, areaId = "", areaName = "";
  if (demo) { base = demo.prices[a.vehicle]; areaId = `sample-${demo.id}`; areaName = `Sample route (${demo.id})`; }
  else {
    const [from, to] = await Promise.all([geocode(a.pickup), geocode(a.dropoff)]);
    if (!from || !to) return null;
    const area = await matchPublishedArea(to) ?? await matchPublishedArea(from);
    if (!area) return null;
    const prices = await pricesForArea(area.id, await drivingMeters(from, to));
    base = prices[a.vehicle]?.total; areaId = area.id; areaName = area.name;
  }
  if (!base) return null;
  const out = leg(base, a.date, { service: "transfer", areaId });
  const back = a.returnTrip && a.returnDate ? leg(base, a.returnDate, { service: "transfer", areaId }) : null;
  const amount = out.total + (back?.total ?? 0);
  return { amount, detail: `${areaName} · ${vehicleName}${back ? ` · ${fmt(out.total)} + ${fmt(back.total)} return` : ""}${seasonNote([out.total !== base && out.season?.name, back !== null && back.total !== base && back.season?.name])}` };
}

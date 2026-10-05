import { env } from "cloudflare:workers";
import { bangkokDepartureIso, validBangkokPickup } from "@/lib/booking-time";
import { HOURLY_MAX_HOURS, HOURLY_MIN_HOURS, areaHourlyPrices, hourlyAreaSettings } from "@/lib/hourly-area-pricing";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { fromPrice, listPackages } from "@/lib/packages";
import { matchPublishedArea, pricesForArea } from "@/lib/pricing";
import { loadInclusions } from "@/lib/route-inclusions-db";
import { withSeason } from "@/lib/seasons";
import { SITE_URL } from "@/lib/site";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

// Non's prices. Every number here comes from the same pricing tables the booking form uses;
// the AI never calculates or invents a price. Anything that can't be priced returns a reason
// so Non hands the chat to staff instead of guessing.

export type Car = { vehicle: VehicleId; name: string; seats: number; bags: number; price: number; bookUrl: string };
export type QuoteResult =
  | { ok: true; kind: "transfer" | "hourly"; summary: string; cars: Car[]; notes: string[] }
  | { ok: false; reason: string; handover: boolean };

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // Bangkok date
const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function checkWhen(date: string, time: string): string | null {
  if (!validDate(date)) return "Ask the customer for the travel date.";
  if (!validTime(time)) return "Ask the customer for the pickup time (24-hour, e.g. 14:30).";
  if (date < today()) return "That date has passed. Ask for a future date.";
  if (!validBangkokPickup(date, time)) return "Choose a pickup at least 3 hours from now, within the next two years, on a 15-minute time slot.";
  return null;
}

/** Cars that fit the group, cheapest first. */
function fitting(prices: Record<string, { total: number }>, passengers: number, bags: number, link: (v: VehicleId) => string): Car[] {
  return (Object.keys(VEHICLES) as VehicleId[])
    .filter((v) => prices[v] && VEHICLES[v].passengers >= passengers && VEHICLES[v].bags >= bags)
    .map((v) => ({ vehicle: v, name: VEHICLES[v].name, seats: VEHICLES[v].passengers, bags: VEHICLES[v].bags, price: prices[v].total, bookUrl: link(v) }))
    .sort((a, b) => a.price - b.price);
}

/** Booking form link with everything Non already knows filled in. */
export function bookingLink(p: { service: "transfer" | "hourly"; pickup: string; dropoff?: string; date: string; time: string; passengers: number; luggage: number; vehicle: VehicleId; hours?: number; pickupPlaceId?: string; dropoffPlaceId?: string }) {
  const q = new URLSearchParams({ rebook: "chat", service: p.service, pickup: p.pickup, date: p.date, time: p.time, passengers: String(p.passengers), luggage: String(p.luggage), vehicle: p.vehicle });
  if (p.dropoff) q.set("dropoff", p.dropoff);
  if (p.hours) q.set("hours", String(p.hours));
  // Google place ids let the booking form price the route at once and open the passenger step.
  if (p.pickupPlaceId) q.set("pickupPlaceId", p.pickupPlaceId);
  if (p.dropoffPlaceId) q.set("dropoffPlaceId", p.dropoffPlaceId);
  return `${SITE_URL}/?${q}#booking-search`;
}

type Place = { id: string; formattedAddress?: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number } };
/** Free text ("Hilton Pattaya", "BKK airport") → one place in Thailand. */
export async function findPlace(text: string): Promise<Place | null> {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.formattedAddress,places.displayName,places.location" },
    body: JSON.stringify({ textQuery: text, regionCode: "TH", languageCode: "en", pageSize: 1, locationRestriction: { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } } }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { places?: Place[] };
  const place = data.places?.[0];
  return place?.location ? place : null;
}

const label = (p: Place, fallback: string) => (p.displayName?.text && p.formattedAddress && !p.formattedAddress.startsWith(p.displayName.text) ? `${p.displayName.text}, ${p.formattedAddress}` : p.formattedAddress || p.displayName?.text || fallback);

export async function quoteTransfer(input: { pickup: string; dropoff: string; date: string; time: string; passengers: number; bags: number }): Promise<QuoteResult> {
  const when = checkWhen(input.date, input.time);
  if (when) return { ok: false, reason: when, handover: false };
  if (input.passengers < 1) return { ok: false, reason: "Ask how many people are travelling.", handover: false };
  if (input.passengers > 10) return { ok: false, reason: "More than 10 passengers needs several cars; hand over to staff.", handover: true };
  if (!env.GOOGLE_MAPS_SERVER_KEY) return { ok: false, reason: "Route pricing is not connected; hand over to staff.", handover: true };
  const [from, to] = await Promise.all([findPlace(input.pickup), findPlace(input.dropoff)]);
  if (!from) return { ok: false, reason: `Could not find the pickup "${input.pickup}". Ask for the hotel name or full address.`, handover: false };
  if (!to) return { ok: false, reason: `Could not find the drop-off "${input.dropoff}". Ask for the hotel name or full address.`, handover: false };
  const area = await matchPublishedArea({ lat: to.location!.latitude, lng: to.location!.longitude });
  if (!area || area.pricingType === "manual") return { ok: false, reason: "This destination needs a custom quote; hand over to staff.", handover: true };
  const route = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
    body: JSON.stringify({ origin: { location: { latLng: from.location } }, destination: { location: { latLng: to.location } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE_OPTIMAL", departureTime: bangkokDepartureIso(input.date, input.time), trafficModel: "BEST_GUESS" }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { routes?: { distanceMeters?: number; duration?: string }[] } | null;
  const leg = route?.routes?.[0];
  if (!leg?.distanceMeters) return { ok: false, reason: "Could not work out the route; hand over to staff.", handover: true };
  const prices = await withSeason(await pricesForArea(area.id, leg.distanceMeters), input.date, { service: "transfer", areaId: area.id });
  const pickupText = label(from, input.pickup), dropoffText = label(to, input.dropoff);
  const cars = fitting(prices, input.passengers, input.bags, (v) => bookingLink({ service: "transfer", pickup: pickupText, dropoff: dropoffText, date: input.date, time: input.time, passengers: input.passengers, luggage: input.bags, vehicle: v, pickupPlaceId: from.id, dropoffPlaceId: to.id }));
  if (!cars.length) return { ok: false, reason: "No single car fits this group and luggage; hand over to staff.", handover: true };
  const inclusions = await loadInclusions({ lat: from.location!.latitude, lng: from.location!.longitude }, { lat: to.location!.latitude, lng: to.location!.longitude }).catch(() => null);
  const minutes = leg.duration ? Math.round(Number.parseFloat(leg.duration) / 60) : null;
  const notes = ["Private car, price per car (not per person)."];
  if (minutes) notes.push(`About ${minutes >= 90 ? `${Math.round(minutes / 30) / 2} hours` : `${minutes} minutes`} drive.`);
  if (inclusions && Object.keys(inclusions).length) notes.push("Tolls/ferry as shown on the booking page are included.");
  return { ok: true, kind: "transfer", summary: `${pickupText} → ${dropoffText}, ${input.date} at ${input.time}, ${input.passengers} passengers, ${input.bags} bags`, cars, notes };
}

export const HOURLY_CITIES = HOURLY_AREAS.map((a) => ({ slug: a.slug, name: a.name }));

/** Car and driver for a number of hours inside one city (day trips with several stops). */
export async function quoteHourly(input: { city: string; pickup: string; hours: number; date: string; time: string; passengers: number; bags: number }): Promise<QuoteResult> {
  const when = checkWhen(input.date, input.time);
  if (when) return { ok: false, reason: when, handover: false };
  const area = HOURLY_AREAS.find((a) => a.slug === input.city || a.name.toLowerCase() === input.city.toLowerCase());
  if (!area) return { ok: false, reason: `Hourly drivers are priced in: ${HOURLY_AREAS.map((a) => a.name).join(", ")}. Other places: hand over to staff.`, handover: true };
  if (input.hours > HOURLY_MAX_HOURS) return { ok: false, reason: `Days longer than ${HOURLY_MAX_HOURS} hours need a custom quote; hand over to staff.`, handover: true };
  const hours = Math.max(HOURLY_MIN_HOURS, Math.ceil(input.hours));
  const settings = await hourlyAreaSettings();
  const setting = settings.find((s) => s.slug === area.slug && s.active);
  if (!setting) return { ok: false, reason: "Hourly service in this city is paused; hand over to staff.", handover: true };
  let prices = await areaHourlyPrices(area.slug, hours);
  if (!prices) return { ok: false, reason: "No hourly prices for this city; hand over to staff.", handover: true };
  prices = await withSeason(prices, input.date, { service: "hourly", areaId: area.slug });
  const cars = fitting(prices, input.passengers, input.bags, (v) => bookingLink({ service: "hourly", pickup: input.pickup, date: input.date, time: input.time, passengers: input.passengers, luggage: input.bags, vehicle: v, hours }));
  if (!cars.length) return { ok: false, reason: "No single car fits this group; hand over to staff.", handover: true };
  return { ok: true, kind: "hourly", summary: `${area.name}, car and driver for ${hours} hours from ${input.pickup}, ${input.date} at ${input.time}, ${input.passengers} passengers`, cars,
    notes: [`Minimum ${HOURLY_MIN_HOURS} hours.`, "Includes driver, fuel and tolls; entry tickets and meals are paid on site.", "Extra time is charged by the hour."] };
}

/** Published day-trip packages for a city, with their "from" price and page. */
export async function findPackages(city: string) {
  const list = await listPackages({ city: city.toLowerCase(), publishedOnly: true }).catch(() => []);
  return list.slice(0, 6).map((p) => ({ name: p.name, kind: p.kind, fromPrice: fromPrice(p), startTimes: p.startTimes, url: `${SITE_URL}/trips/${p.slug}` }));
}

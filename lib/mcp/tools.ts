import { destinations, publicPages } from "../public-content";
import { VEHICLES } from "../vehicles";
import { FULL_REFUND_HOURS, PARTIAL_REFUND_HOURS, PARTIAL_REFUND_PERCENT, REFUND_POLICY_VERSION } from "../refund-policy";
import { SUPPORT_EMAIL, WHATSAPP } from "../contact";
import { bookingLink } from "./booking-link";
import { linkSchema, quoteSchema, validateTool } from "./schemas";
import type { Resource } from "./protocol";

const pageText = (slug: string) => {
  const page = publicPages.find(p => p.slug === slug)!;
  return [page.title, page.intro, ...page.sections.map(s => `${s.title}: ${s.body}`)].join("\n\n");
};
export const cancellationPolicy = {
  version: REFUND_POLICY_VERSION, url: "https://waydidi.com/refund-policy",
  summary: `More than ${FULL_REFUND_HOURS} hours before pickup: full refund. ${PARTIAL_REFUND_HOURS}–${FULL_REFUND_HOURS} hours: ${PARTIAL_REFUND_PERCENT}% refund. Less than ${PARTIAL_REFUND_HOURS} hours or no-show: non-refundable. Product-specific terms accepted at booking take precedence. Times are Asia/Bangkok.`,
};
export const resources: Resource[] = [
  { uri: "waydidi://vehicle-classes", name: "Vehicle classes", mimeType: "text/plain", text: Object.entries(VEHICLES).map(([id, v]) => `${id}: ${v.name}; up to ${v.passengers} passengers and ${v.bags} checked suitcases, each with a carry-on. Prices depend on the route, not the example vehicle price.`).join("\n") },
  { uri: "waydidi://cancellation-policy", name: "Refund and cancellation policy", mimeType: "text/plain", text: `${cancellationPolicy.summary}\n${cancellationPolicy.url}\nPolicy version ${REFUND_POLICY_VERSION}` },
  { uri: "waydidi://how-booking-works", name: "How booking works", mimeType: "text/plain", text: `${pageText("about")}\n\nChoose your route and time, review a vehicle and live price at https://waydidi.com, enter passenger details there, accept the terms and complete checkout. MCP estimates and links do not reserve a ride.` },
  { uri: "waydidi://contact", name: "Contact", mimeType: "text/plain", text: `${pageText("contact")}\nEmail: ${SUPPORT_EMAIL}\nWhatsApp: ${WHATSAPP}\nhttps://waydidi.com/contact` },
];
// Airport names come from the same public city-page area lists as the website.
const airports = [...new Set(destinations.flatMap(d => d.areas ?? []).filter(name => /airport|\([A-Z]{3}\)/i.test(name)))];
export const knownPlaces = [
  ...destinations.map(d => ({ name: d.name, kind: "destination", url: `https://waydidi.com/destinations/${d.slug}` })),
  ...airports.map(name => ({ name, kind: "airport", url: "https://waydidi.com/airport-transfer" })),
];
export async function callPublicTool(name: string, args: Record<string, unknown>, ip = "unknown"): Promise<unknown> {
  const parsed = validateTool(name, args);
  if (!parsed.success) throw new Error("INVALID_TOOL_INPUT");
  if (name === "search_places") {
    const query = String(args.query).trim().toLocaleLowerCase();
    return { places: knownPlaces.filter(p => p.name.toLocaleLowerCase().includes(query)).slice(0, 30), note: "Public destinations, not exact pickup pins. Use the precise hotel, airport or street address when requesting a quote." };
  }
  if (name === "get_booking_link") return bookingLink(linkSchema.parse(args));
  const { publicQuote } = await import("./runtime");
  return publicQuote(quoteSchema.parse(args), ip);
}

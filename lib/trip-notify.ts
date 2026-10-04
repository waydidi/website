import { sendTripEmail } from "@/lib/email";
import { pushLine } from "@/lib/line";
import type { TripRow } from "@/lib/smart-trips";

const niceDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Date to be confirmed");
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** Emails the customer their itinerary link. */
export async function notifyTripSent(trip: TripRow, link: string, agencyName: string | null) {
  if (!trip.customerEmail) return "not_sent";
  const result = await sendTripEmail({
    to: trip.customerEmail, kicker: agencyName ? `Prepared by ${agencyName}` : "Your private day trip",
    title: `Your itinerary: ${trip.title}`,
    intro: `Hi ${trip.customerName || "there"}, here is your day planned stop by stop, with times, a map and what to bring. Have a look, ask for any change, or accept and pay when you're happy.`,
    rows: [["Date", niceDate(trip.tripDate)], ["Pickup", `${trip.startTime} · ${trip.pickupText}`], ["Total", thb(trip.total)]],
    cta: "View my itinerary", link, footer: `Times are estimates and may change with traffic. This price is held for ${trip.holdDays} days.`,
    tag: `trip-sent-${trip.id}-v${trip.version + 1}`,
  });
  return result.status;
}

/** Tells staff on LINE that a customer replied. */
export async function notifyTripReply(trip: TripRow, kind: "accepted" | "change", message: string, origin: string) {
  const head = kind === "accepted" ? `✅ ${trip.customerName || "Customer"} accepted trip ${trip.ref}` : `✏️ ${trip.customerName || "Customer"} asked for changes to ${trip.ref}`;
  await pushLine([{ type: "text", text: `${head}\n${trip.title}${trip.tripDate ? ` · ${trip.tripDate}` : ""}${message ? `\n“${message.slice(0, 400)}”` : ""}\n${origin}/admin/trips/${trip.id}` }]).catch(() => undefined);
}

/** Tells an agency that Waydidi has priced the trip they asked about. */
export async function notifyAgencyPriced(to: string, name: string, trip: TripRow, origin: string) {
  return (await sendTripEmail({
    to, kicker: "Price ready", title: `Your trip ${trip.ref} has a price`,
    intro: `Hi ${name}, we've priced “${trip.title}”. You can review it and send it to your guest from the trip planner.`,
    rows: [["Trip", trip.title], ["Date", niceDate(trip.tripDate)], ["Car and driver", thb(trip.transportPrice)]],
    cta: "Open the trip", link: `${origin}/agency/trips/${trip.id}`, footer: "You're getting this because you asked Waydidi to price this trip.",
    tag: `agency-priced-${trip.id}-${trip.transportPrice}`,
  })).status;
}

import { sendTripEmail } from "@/lib/email";
import { pushLine } from "@/lib/line";
import type { TripRow } from "@/lib/smart-trips";
import { dateLocale, fill, tripWords } from "@/lib/trip-i18n";

const niceDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Date to be confirmed");
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** Emails the customer their itinerary link, in the trip's language. */
export async function notifyTripSent(trip: TripRow, link: string, agencyName: string | null, dayCount = 1) {
  if (!trip.customerEmail) return "not_sent";
  const w = tripWords(trip.language);
  const date = trip.tripDate ? new Date(`${trip.tripDate}T12:00:00Z`).toLocaleDateString(dateLocale(trip.language), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—";
  const result = await sendTripEmail({
    to: trip.customerEmail, kicker: agencyName ? fill(w.preparedBy, { agency: agencyName }) : dayCount > 1 ? fill(w.multiDay, { n: dayCount }) : w.emailSentKicker,
    title: fill(w.emailSentTitle, { title: trip.title }),
    intro: fill(w.emailSentIntro, { name: trip.customerName || "" }),
    rows: [[w.emailDate, dayCount > 1 ? `${date} (${fill(w.multiDay, { n: dayCount })})` : date], [w.emailPickup, `${trip.startTime} · ${trip.pickupText}`], [w.emailTotal, thb(trip.total)]],
    cta: w.emailView, link, footer: fill(w.emailHold, { n: trip.holdDays }),
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

import { and, eq, isNull, lte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { smartTrips } from "@/db/schema";
import { sendTripEmail } from "@/lib/email";
import { tripSnapshot } from "@/lib/smart-trips";

const siteUrl = () => ((env as unknown as Record<string, string | undefined>).WAYDIDI_PUBLIC_URL || "https://waydidi.com").replace(/\/$/, "");
/** Public review page (e.g. Google Business "write a review" link). Optional. */
export const reviewUrl = () => (env as unknown as Record<string, string | undefined>).WAYDIDI_REVIEW_URL || null;

/**
 * After a paid day trip ends: one thank-you email asking how the day went.
 * Sent an hour after the planned return, or the next morning at the latest.
 */
export async function sendTripThanks(at = new Date()) {
  const bangkok = new Date(at.getTime() + 7 * 3600_000);
  const today = bangkok.toISOString().slice(0, 10);
  const nowMin = bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes();
  const rows = await getDb().select().from(smartTrips)
    .where(and(eq(smartTrips.status, "accepted"), isNull(smartTrips.thankedAt), lte(smartTrips.tripDate, today))).limit(25);
  let sent = 0;
  for (const trip of rows) {
    const snap = tripSnapshot(trip);
    if (!snap || !trip.customerEmail) continue;
    if (trip.tripDate === today && nowMin < snap.returnAt + 60) continue;
    // Claim it first so two runs never send twice.
    const [claimed] = await getDb().update(smartTrips).set({ thankedAt: at.toISOString() })
      .where(and(eq(smartTrips.id, trip.id), isNull(smartTrips.thankedAt))).returning({ id: smartTrips.id });
    if (!claimed) continue;
    const places = snap.stops.filter((s) => s.kind === "attraction" && !(snap.liveSkipped ?? []).includes(s.id)).map((s) => s.name);
    await sendTripEmail({
      to: trip.customerEmail, kicker: "Thank you for travelling with Waydidi",
      title: `How was your day, ${trip.customerName?.split(" ")[0] || "traveller"}?`,
      intro: `We hope you loved ${places.slice(0, 3).join(", ")}${places.length > 3 ? " and more" : ""}. It takes 20 seconds to tell us how the day went, and it helps us and your driver a lot.`,
      rows: [["Trip", snap.title], ["Reference", trip.bookingReference ?? snap.ref]],
      cta: "Rate your day", link: `${siteUrl()}/itinerary/${trip.token}#feedback`,
      footer: "You're getting this one-time email because you booked this day trip with Waydidi.",
      tag: `trip-thanks-${trip.id}`,
    }).catch((error) => console.error("trip thank-you failed", error));
    sent++;
  }
  return sent;
}

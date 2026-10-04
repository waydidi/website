import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { smartTrips } from "@/db/schema";
import { sendTripEmail } from "@/lib/email";
import { groupDays, tripSnapshot } from "@/lib/smart-trips";
import { fill, tripWords } from "@/lib/trip-i18n";

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
    .where(and(eq(smartTrips.status, "accepted"), isNull(smartTrips.thankedAt), isNotNull(smartTrips.customerEmail), lte(smartTrips.tripDate, today))).orderBy(asc(smartTrips.tripDate)).limit(25);
  let sent = 0;
  for (const trip of rows) {
    const snap = tripSnapshot(trip);
    if (!snap || !trip.customerEmail) continue;
    if (trip.tripDate === today && nowMin < snap.returnAt + 60) continue;
    const days = await groupDays(trip);
    // Multi-day trip: thank once, after the last day; earlier days are marked handled.
    if (days.at(-1)!.id !== trip.id) { await getDb().update(smartTrips).set({ thankedAt: at.toISOString() }).where(eq(smartTrips.id, trip.id)); continue; }
    const lead = days[0];
    // Claim it first so two runs never send twice.
    const [claimed] = await getDb().update(smartTrips).set({ thankedAt: at.toISOString() })
      .where(and(eq(smartTrips.id, trip.id), isNull(smartTrips.thankedAt))).returning({ id: smartTrips.id });
    if (!claimed) continue;
    const places = days.flatMap((d) => { const x = tripSnapshot(d); return x ? x.stops.filter((s) => s.kind === "attraction" && !(x.liveSkipped ?? []).includes(s.id)).map((s) => s.name) : []; });
    const w = tripWords(trip.language);
    await sendTripEmail({
      to: trip.customerEmail, kicker: w.thanksKicker,
      title: fill(w.thanksTitle, { name: trip.customerName?.split(" ")[0] || w.traveller2 }),
      intro: fill(w.thanksIntro, { places: `${places.slice(0, 3).join(", ")}${places.length > 3 ? w.andMore : ""}` }),
      rows: [[w.thanksTrip, snap.title], [w.thanksRef, trip.bookingReference ?? snap.ref]],
      cta: w.thanksCta, link: `${siteUrl()}/itinerary/${lead.token}#feedback`,
      footer: w.thanksFooter,
      tag: `trip-thanks-${trip.id}`,
    }).catch((error) => console.error("trip thank-you failed", error));
    sent++;
  }
  return sent;
}

import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, journeyLegs, fareQuotes } from "@/db/schema";
export type JourneyLeg = "outbound" | "return";
type Booking = typeof bookings.$inferSelect;
export type Journey = Booking & {
    leg: JourneyLeg;
    journeyId: string;
    parentStatus: string;
};
export function parseLeg(value: unknown): JourneyLeg { return value === "return" ? "return" : "outbound"; }
export function projectJourney(b: Booking, leg: JourneyLeg, row?: typeof journeyLegs.$inferSelect): Journey {
    const terminal = ["cancelled", "binned", "expired", "pending_payment"].includes(b.status);
    const common = { ...b, leg, journeyId: `${b.reference}:${leg}`, parentStatus: b.status, status: terminal ? b.status : (row?.status === "pending_payment" && b.status === "confirmed" ? "confirmed" : row?.status) ?? b.status };
    if (leg === "outbound")
        return { ...common, total: b.outboundTotal ?? b.total, pickupDate: row?.pickupDate ?? b.pickupDate, pickupTime: row?.pickupTime ?? b.pickupTime };
    if (!b.returnDate || !b.returnTime)
        throw new Error("Return journey not found.");
    return { ...common, pickup: b.returnPickup ?? b.dropoff, dropoff: b.returnDropoff ?? b.pickup,
        pickupDate: row?.pickupDate ?? b.returnDate, pickupTime: row?.pickupTime ?? b.returnTime,
        pickupLatitude: !b.returnPickup || b.returnPickup === b.dropoff ? b.dropoffLatitude : null, pickupLongitude: !b.returnPickup || b.returnPickup === b.dropoff ? b.dropoffLongitude : null,
        dropoffLatitude: !b.returnDropoff || b.returnDropoff === b.pickup ? b.pickupLatitude : null, dropoffLongitude: !b.returnDropoff || b.returnDropoff === b.pickup ? b.pickupLongitude : null,
        routeDurationSeconds: b.returnDurationSeconds, expectedRoutePolyline: b.returnRoutePolyline, routeDistanceMeters: b.returnDistanceMeters,
        total: b.returnTotal ?? 0, serviceType: "transfer", bookedHours: null, scheduledEndAt: null,
        flightNumber: null, flightStatus: null, flightScheduledArrival: null, flightEstimatedArrival: null,
    };
}
export async function journeysFor(rows: Booking[]): Promise<Journey[]> {
    if (!rows.length)
        return [];
    const records: Array<typeof journeyLegs.$inferSelect> = [];
    for (let i = 0; i < rows.length; i += 80)
        records.push(...await getDb().select().from(journeyLegs).where(inArray(journeyLegs.bookingReference, rows.slice(i, i + 80).map(b => b.reference))));
    const map = new Map(records.map(r => [r.id, r]));
    const ids = rows.map(b => b.returnFareQuoteId).filter((id): id is string => Boolean(id));
    const quotes: Array<typeof fareQuotes.$inferSelect> = [];
    for (let i = 0; i < ids.length; i += 80)
        quotes.push(...await getDb().select().from(fareQuotes).where(inArray(fareQuotes.id, ids.slice(i, i + 80))));
    const quoteMap = new Map(quotes.map(q => [q.id, q]));
    return rows.flatMap(b => (b.returnDate && b.returnTime ? ["outbound", "return"] as const : ["outbound"] as const).map(leg => (() => { const j = projectJourney(b, leg, map.get(`${b.reference}:${leg}`)); const q = leg === "return" && b.returnFareQuoteId ? quoteMap.get(b.returnFareQuoteId) : null; return q ? { ...j, pickupLatitude: q.pickupLatitude, pickupLongitude: q.pickupLongitude, dropoffLatitude: q.dropoffLatitude, dropoffLongitude: q.dropoffLongitude } : j; })()));
}
export async function journeyFor(b: Booking, leg: JourneyLeg) { return (await journeysFor([b])).find(j => j.leg === leg) ?? null; }
export async function completeJourney(reference: string, leg: JourneyLeg, status: "completed" | "no_show") {
    const [b] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!b || b.status !== "confirmed" || (leg === "return" && (!b.returnDate || !b.returnTime)))
        return;
    const now = new Date().toISOString();
    const statements = [env.DB.prepare(`INSERT OR IGNORE INTO journey_legs(id,booking_reference,leg,status,created_at,updated_at) VALUES (?,?,'outbound','confirmed',?,?)`).bind(`${reference}:outbound`, reference, now, now)];
    if (b.returnDate && b.returnTime)
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO journey_legs(id,booking_reference,leg,status,created_at,updated_at) VALUES (?,?,'return','confirmed',?,?)`).bind(`${reference}:return`, reference, now, now));
    statements.push(env.DB.prepare(`UPDATE journey_legs SET status=?,updated_at=? WHERE booking_reference=? AND leg=? AND status IN ('confirmed','pending_payment') AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND status='confirmed')`).bind(status, now, reference, leg, reference));
    statements.push(env.DB.prepare(`UPDATE bookings SET status=CASE WHEN EXISTS(SELECT 1 FROM journey_legs WHERE booking_reference=? AND status='no_show') THEN 'no_show' ELSE 'completed' END,updated_at=? WHERE reference=? AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM journey_legs WHERE booking_reference=? AND status NOT IN ('completed','no_show'))`).bind(reference, now, reference, reference));
    await env.DB.batch(statements);
}

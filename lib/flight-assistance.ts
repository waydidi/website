import { and, asc, eq, isNotNull, or, lt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, operationsAlerts, journeyLegs } from "@/db/schema";
import { journeyFor, journeysFor } from "@/lib/journey-legs";
import { lookupFlight, type FlightSnapshot } from "@/lib/aviationstack";
import { isAirportPickup } from "@/lib/trip-rules";
import { pickupTimestamp } from "@/lib/operations-calendar";
type Booking = typeof bookings.$inferSelect;
export function flightAdjustment(booking: Booking, flight: FlightSnapshot, plannedOffsetMinutes?: number | null) {
    const arrival = Date.parse(flight.actualArrival ?? flight.estimatedArrival ?? flight.scheduledArrival ?? "");
    const baseline = Date.parse(booking.flightScheduledArrival ?? flight.scheduledArrival ?? "");
    const changed = Number.isFinite(arrival) && Number.isFinite(baseline) && Math.abs(arrival - baseline) >= 30 * 60000;
    const disrupted = ["cancelled", "diverted"].includes(flight.status);
    // Preserve the customer's planned arrival-to-pickup interval. Suggest only;
    // operations keeps authority over pickup changes and driver availability.
    const offset = plannedOffsetMinutes != null ? plannedOffsetMinutes*60_000 : pickupTimestamp(booking.pickupDate, booking.pickupTime) - baseline;
    const proposed = changed && !disrupted && offset >= 0 && offset <= 6 * 3600000 ? new Date(arrival + offset).toISOString() : null;
    return { needsReview: changed || disrupted, differenceMinutes: Number.isFinite(arrival - baseline) ? Math.round((arrival - baseline) / 60000) : null, proposedPickupAt: proposed };
}
export async function refreshBookingFlight(reference: string, force = false) {
    const [b] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!b || b.status !== "confirmed" || !b.flightNumber || !isAirportPickup(b))
        throw new Error("No active airport arrival to refresh.");
    // Lookup honors shared cache TTL, including manual refreshes, to avoid quota storms.
    const outbound = await journeyFor(b, "outbound");
    if (outbound?.status !== "confirmed")
        throw new Error("Outbound journey is no longer active.");
    const [watch] = await getDb().select().from(journeyLegs).where(eq(journeyLegs.id,`${reference}:outbound`)).limit(1);
    const flightDate = watch?.flightDate ?? b.pickupDate;
    const flight = await lookupFlight(b.flightNumber, flightDate, force && (!b.flightLastCheckedAt || Date.now()-Date.parse(b.flightLastCheckedAt)>=5*60_000));
    const baseline = Date.parse(b.flightScheduledArrival ?? flight.scheduledArrival ?? "");
    const offset = watch?.arrivalPickupOffsetMinutes ?? (Number.isFinite(baseline) ? Math.round((pickupTimestamp(b.pickupDate,b.pickupTime)-baseline)/60_000) : null);
    const adjustment = flightAdjustment(b, flight, offset);
    const createdAt = new Date().toISOString();
    await getDb().insert(journeyLegs).values({id:`${reference}:outbound`,bookingReference:reference,leg:"outbound",status:"confirmed",flightDate,arrivalPickupOffsetMinutes:offset,createdAt,updatedAt:createdAt}).onConflictDoUpdate({target:journeyLegs.id,set:{flightDate,arrivalPickupOffsetMinutes:offset}});
    const now = new Date().toISOString();
    await getDb().update(bookings).set({ flightStatus: flight.status, flightAirline: flight.airline, flightDepartureAirport: flight.departureAirport, flightArrivalAirport: flight.arrivalAirport, flightScheduledArrival: flight.scheduledArrival, flightEstimatedArrival: flight.actualArrival ?? flight.estimatedArrival, flightLastCheckedAt: flight.checkedAt, updatedAt: now }).where(and(eq(bookings.reference, reference), eq(bookings.status, "confirmed")));
    const dedupeKey = `flight-change:${reference}:outbound`;
    if (adjustment.needsReview) {
        const details = JSON.stringify({ flightNumber: flight.flightNumber, status: flight.status, scheduledArrival: flight.scheduledArrival, arrival: flight.actualArrival ?? flight.estimatedArrival, checkedAt: flight.checkedAt, ...adjustment });
        const [existing] = await getDb().select().from(operationsAlerts).where(eq(operationsAlerts.dedupeKey, dedupeKey)).limit(1);
        let sameChange = false;
        try {
            const previous = JSON.parse(existing?.details ?? "{}");
            sameChange = previous.status === flight.status && previous.arrival === (flight.actualArrival ?? flight.estimatedArrival);
        }
        catch { }
        await getDb().insert(operationsAlerts).values({ id: crypto.randomUUID(), bookingReference: reference, alertType: "flight_change", severity: ["cancelled", "diverted"].includes(flight.status) ? "critical" : "warning", title: "Flight change: review outbound pickup", details, dedupeKey, status: "open", detectedAt: now, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: operationsAlerts.dedupeKey, set: { status: sameChange ? existing?.status ?? "open" : "open", resolvedAt: sameChange ? existing?.resolvedAt ?? null : null, resolutionNote: sameChange ? existing?.resolutionNote ?? null : null, details, title: "Flight change: review outbound pickup", detectedAt: now, updatedAt: now } });
    }
    else
        await getDb().update(operationsAlerts).set({ status: "resolved", resolvedAt: now, resolutionNote: "Arrival is within the review threshold.", updatedAt: now }).where(and(eq(operationsAlerts.dedupeKey, dedupeKey), eq(operationsAlerts.status, "open")));
    return { flight, adjustment };
}
export async function runFlightAssistance(at = new Date()) {
    const cutoff = new Date(at.getTime() - 30 * 60000).toISOString();
    const rows = await getDb().select().from(bookings).where(and(eq(bookings.status, "confirmed"), isNotNull(bookings.flightNumber), or(isNull(bookings.flightLastCheckedAt), lt(bookings.flightLastCheckedAt, cutoff)))).orderBy(asc(bookings.flightLastCheckedAt));
    const active = (await journeysFor(rows)).filter(j => j.leg === "outbound" && j.status === "confirmed");
    const eligible = active.filter(b => isAirportPickup(b) && Math.abs(pickupTimestamp(b.pickupDate, b.pickupTime) - at.getTime()) <= 48 * 3600000).slice(0, 10);
    let refreshed = 0, failed = 0;
    for (const b of eligible) {
        try {
            await refreshBookingFlight(b.reference);
            refreshed++;
        }
        catch {
            failed++;
            await getDb().update(bookings).set({ flightLastCheckedAt: at.toISOString() }).where(eq(bookings.reference, b.reference));
        }
    }
    return { scanned: eligible.length, refreshed, failed };
}

import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings, operationsAlerts, bookingEvents } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { refreshBookingFlight } from "@/lib/flight-assistance";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { isAirportPickup } from "@/lib/trip-rules";
export async function GET() { if (!await getWaydidiAdmin())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const [rows, alerts] = await Promise.all([getDb().select().from(bookings).where(eq(bookings.status, "confirmed")), getDb().select().from(operationsAlerts).where(eq(operationsAlerts.alertType, "flight_change")).orderBy(desc(operationsAlerts.detectedAt))]); return NextResponse.json({ bookings: rows.filter(b => b.flightNumber && isAirportPickup(b)).map(b => ({ reference: b.reference, flightNumber: b.flightNumber, pickupDate: b.pickupDate, pickupTime: b.pickupTime, status: b.flightStatus, arrival: b.flightEstimatedArrival ?? b.flightScheduledArrival, checkedAt: b.flightLastCheckedAt })), alerts }, { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
    const admin = await getWaydidiAdmin();
    if (!admin)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!sameOrigin(request) || !isJsonRequest(request))
        return NextResponse.json({ error: "Request blocked" }, { status: 403 });
    const input = await request.json() as {
        action?: string;
        reference?: string;
        alertId?: string;
        reason?: string;
    };
    if (input.action === "refresh") {
        try {
            return NextResponse.json(await refreshBookingFlight(String(input.reference ?? ""),true));
        }
        catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "Flight lookup unavailable" }, { status: 502 });
        }
    }
    if (input.action === "resolve" && String(input.reason ?? "").trim().length >= 3) {
        const now = new Date().toISOString();
        const [alert] = await getDb().select().from(operationsAlerts).where(and(eq(operationsAlerts.id, String(input.alertId ?? "")), eq(operationsAlerts.alertType, "flight_change"))).limit(1);
        if (!alert)
            return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        await getDb().batch([getDb().update(operationsAlerts).set({ status: "resolved", resolvedAt: now, resolutionNote: `${admin.email}: ${input.reason!.slice(0, 300)}`, updatedAt: now }).where(eq(operationsAlerts.id, alert.id)), getDb().insert(bookingEvents).values({ bookingReference: alert.bookingReference, eventType: "flight_change_reviewed", providerEventId: `flight-review:${crypto.randomUUID()}`, createdAt: now })]);
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unsupported action or missing review note" }, { status: 400 });
}

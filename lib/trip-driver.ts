import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { attractions, smartTrips, suppliers } from "@/db/schema";
import { pushLine } from "@/lib/line";
import { tripSnapshot, tripStops } from "@/lib/smart-trips";

const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

export type DriverDay = {
  ref: string; dayNumber: number; date: string | null; title: string; pickupTime: string; pickup: string; returnAt: string; end: string; guests: string; notes: string | null; skipped: string[];
  stops: { name: string; arrive: string; start: string; end: string; checkIn: string | null; program: string | null; note: string | null; tickets: string | null; contact: string | null; lat: number | null; lng: number | null }[];
};

/** The plan a driver needs for a booking made from a smart trip: stops, times, check-in, supplier contacts. No prices. */
export async function driverPlan(reference: string): Promise<DriverDay[]> {
  const trips = await getDb().select().from(smartTrips).where(eq(smartTrips.bookingReference, reference)).orderBy(asc(smartTrips.dayNumber));
  if (!trips.length) return [];
  const attractionIds = [...new Set(trips.flatMap((t) => tripStops(t).map((s) => s.attractionId).filter((x): x is string => Boolean(x))))];
  const rows = attractionIds.length ? await getDb().select({ id: attractions.id, supplierId: attractions.supplierId, phone: attractions.phone }).from(attractions).where(inArray(attractions.id, attractionIds)) : [];
  const supplierIds = rows.map((r) => r.supplierId).filter((x): x is string => Boolean(x));
  const supplierRows = supplierIds.length ? await getDb().select().from(suppliers).where(inArray(suppliers.id, supplierIds)) : [];
  return trips.flatMap((t) => {
    const s = tripSnapshot(t);
    if (!s) return [];
    const byStop = Object.fromEntries(tripStops(t).map((x) => [x.id, x.attractionId]));
    const skipped = s.liveSkipped ?? [];
    return [{
      ref: t.ref, dayNumber: t.dayNumber, date: s.tripDate, title: s.title, pickupTime: s.startTime, pickup: s.pickupText, returnAt: hhmm(s.returnAt), end: s.endText,
      guests: `${s.adults} adult${s.adults > 1 ? "s" : ""}${s.children ? `, ${s.children} child${s.children > 1 ? "ren" : ""}` : ""}${t.customerName ? ` · ${t.customerName}` : ""}${t.customerPhone ? ` · ${t.customerPhone}` : ""}`,
      notes: s.notes, skipped: s.stops.filter((x) => skipped.includes(x.id)).map((x) => x.name),
      stops: s.stops.filter((x) => !skipped.includes(x.id)).map((x) => {
        const a = rows.find((r) => r.id === byStop[x.id]);
        const sup = supplierRows.find((r) => r.id === a?.supplierId);
        const contact = sup ? [sup.name, sup.contactName, sup.phone, sup.lineId ? `LINE ${sup.lineId}` : null].filter(Boolean).join(" · ") : a?.phone ?? null;
        return { name: x.name, arrive: hhmm(x.arrival), start: hhmm(x.start), end: hhmm(x.end), checkIn: x.checkIn != null ? hhmm(x.checkIn) : null, program: x.program, note: x.note,
          tickets: x.fee ? (x.fee.included ? "Tickets included (prepaid by Waydidi)" : "Guests pay entrance on site") : null, contact, lat: x.lat, lng: x.lng };
      }),
    }];
  });
}

/** Plain-text plan for LINE, so staff can forward it to the driver when they assign the trip. */
export function driverPlanText(days: DriverDay[], driverName: string, driverUrl: string) {
  const lines = [`🚗 Day plan for ${driverName}`];
  for (const d of days) {
    lines.push("", `${days.length > 1 ? `Day ${d.dayNumber} · ` : ""}${d.date ?? ""} · ${d.title}`, `${d.pickupTime} Pickup: ${d.pickup}`, `Guests: ${d.guests}`);
    for (const s of d.stops) lines.push(`${s.start}–${s.end} ${s.name}${s.checkIn ? ` (check in by ${s.checkIn})` : ""}${s.contact ? `\n   ☎ ${s.contact}` : ""}${s.tickets ? `\n   ${s.tickets}` : ""}`);
    lines.push(`${d.returnAt} Drop-off: ${d.end}`);
  }
  lines.push("", `Driver page: ${driverUrl}`);
  return lines.join("\n").slice(0, 4900);
}

/** After a driver is assigned to a smart-trip booking: send the day plan to the staff LINE group to forward. */
export async function sendDriverPlanToLine(reference: string, driverName: string, driverUrl: string) {
  const days = await driverPlan(reference);
  if (!days.length) return false;
  await pushLine([{ type: "text", text: driverPlanText(days, driverName, driverUrl) }]);
  return true;
}

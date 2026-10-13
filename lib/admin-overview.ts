import { and, count, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { fullName } from "@/lib/person-name";
import { getDb } from "@/db";
import {
  agencyApplications, bookingAssignments, bookingChangeRequests, bookings, driverApplications, drivers,
  bookingCosts, journeyLegs, memberBoxes, operationsAlerts,
} from "@/db/schema";
import { SITE_URL } from "@/lib/site";
import { rideUrl } from "@/lib/trip-access";
import { assignedDriverUrl } from "@/lib/trip-links";
import { editableFrom, type EditableBooking } from "@/lib/booking-edit";

// Bookings that never became real trips.
const DEAD = ["expired", "payment_failed"];
const LIVE = ["pending_payment", "confirmed", "completed"];

/** YYYY-MM-DD in Bangkok, `offset` days from today. */
export function bangkokDate(offset = 0, at = new Date()) {
  return new Date(at.getTime() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

export type OverviewRide = {
  reference: string; pickupDate: string; pickupTime: string; pickup: string; dropoff: string; name: string;
  vehicle: string; passengers: number; luggage: number; status: string; paymentMethod: string; paymentStatus: string; total: number; flightNumber: string | null; flightStatus: string | null;
  driver: string | null; driverId: string | null; driverStatus: string | null; attention: boolean;
  // Same extras as the Bookings cards.
  roundtrip?: boolean; leg?: "outbound" | "return"; rideUrl?: string | null; driverUrl?: string | null; cost?: number | null;
  edit?: EditableBooking;
};

export async function adminOverview(at = new Date()) {
  const db = getDb();
  const today = bangkokDate(0, at);
  const tomorrow = bangkokDate(1, at);
  const since30 = new Date(at.getTime() - 30 * 86_400_000).toISOString();
  const soon = new Date(at.getTime() + 24 * 3600_000);

  // Everything below is independent, so it runs at the same time.
  const [driverList, upcoming, recent, cashDue, changeRequests, openAlerts, tickets, agencyNew, driverNew, attention] = await Promise.all([
    db.select({ id: drivers.id, name: drivers.fullName, phone: drivers.phone, email: drivers.email, area: drivers.baseLocation, vehicle: drivers.vehicle, carPlate: drivers.carPlate, driverType: drivers.driverType, vehicleType: drivers.vehicleType, photoKey: drivers.photoKey })
      .from(drivers).where(eq(drivers.status, "active")).orderBy(drivers.fullName).catch(() => []),
    // Only the columns shown: the bookings table is at D1's 100-column limit, so
    // selecting all of it plus the joined columns would fail.
    db.select({
      reference: bookings.reference, pickupDate: bookings.pickupDate, pickupTime: bookings.pickupTime, pickup: bookings.pickup, dropoff: bookings.dropoff,
      customerName: bookings.customerName, customerSurname: bookings.customerSurname, customerPhone: bookings.customerPhone, customerEmail: bookings.customerEmail, childSeats: bookings.childSeats, specialRequests: bookings.specialRequests, vehicle: bookings.vehicle, passengers: bookings.passengers, luggage: bookings.luggage, status: bookings.status,
      paymentMethod: bookings.paymentMethod, paymentStatus: bookings.paymentStatus, total: bookings.total, flightNumber: bookings.flightNumber, flightStatus: bookings.flightStatus, attentionStatus: bookings.attentionStatus,
      createdAt: bookings.createdAt, serviceType: bookings.serviceType, returnDate: bookings.returnDate, returnTime: bookings.returnTime, returnPickup: bookings.returnPickup, returnDropoff: bookings.returnDropoff,
    }).from(bookings)
      // A round trip whose first trip has passed still shows, with its second trip.
      .where(and(or(and(gte(bookings.pickupDate, today), lte(bookings.pickupDate, bangkokDate(30, at))), and(gte(bookings.returnDate, today), lte(bookings.returnDate, bangkokDate(30, at)))), inArray(bookings.status, ["pending_payment", "confirmed"]), isNull(bookings.binnedAt)))
      .orderBy(bookings.pickupDate, bookings.pickupTime),
    db.select({ createdAt: bookings.createdAt, total: bookings.total, status: bookings.status, cancelledAt: bookings.cancelledAt }).from(bookings)
      .where(and(gte(bookings.createdAt, since30), notInArray(bookings.status, DEAD), isNull(bookings.binnedAt))),
    db.select({ n: count(), sum: sql<number>`coalesce(sum(${bookings.total}), 0)` }).from(bookings)
      .where(and(eq(bookings.paymentStatus, "cash_due"), eq(bookings.status, "confirmed"), gte(bookings.pickupDate, today), isNull(bookings.binnedAt))),
    db.select({ n: count() }).from(bookingChangeRequests).where(eq(bookingChangeRequests.status, "pending")).catch(() => [{ n: 0 }]),
    db.select({ n: count() }).from(operationsAlerts).where(eq(operationsAlerts.status, "open")).catch(() => [{ n: 0 }]),
    db.select({ n: count() }).from(memberBoxes).where(eq(memberBoxes.fulfilment, "to_arrange")).catch(() => [{ n: 0 }]),
    db.select({ n: count() }).from(agencyApplications).where(eq(agencyApplications.status, "new")).catch(() => [{ n: 0 }]),
    db.select({ n: count() }).from(driverApplications).where(eq(driverApplications.status, "new")).catch(() => [{ n: 0 }]),
    db.select({ n: count() }).from(bookings).where(and(eq(bookings.attentionStatus, "attention"), inArray(bookings.status, LIVE), gte(bookings.pickupDate, today), isNull(bookings.binnedAt))),
  ]);

  // Each booking's drivers (both trips) and first trips already completed.
  const refs = upcoming.map((b) => b.reference);
  const legRows: { ref: string; leg: string; driverId: string; status: string; driver: string | null }[] = [];
  const doneRefs: string[] = [];
  for (let i = 0; i < refs.length; i += 90) {
    const part = refs.slice(i, i + 90);
    legRows.push(...await db.select({ ref: bookingAssignments.bookingReference, leg: bookingAssignments.leg, driverId: bookingAssignments.driverId, status: bookingAssignments.currentStatus, driver: drivers.fullName })
      .from(bookingAssignments).leftJoin(drivers, eq(drivers.id, bookingAssignments.driverId)).where(and(inArray(bookingAssignments.bookingReference, part), isNull(bookingAssignments.revokedAt))).catch(() => []));
    doneRefs.push(...(await db.select({ ref: journeyLegs.bookingReference }).from(journeyLegs).where(and(inArray(journeyLegs.bookingReference, part), eq(journeyLegs.leg, "outbound"), inArray(journeyLegs.status, ["completed", "no_show"]))).catch(() => [])).map((r) => r.ref));
  }
  const firstDone = new Set(doneRefs);
  const legOf = (ref: string, leg: string) => legRows.find((a) => a.ref === ref && a.leg === leg);
  // A round trip shows its first trip until that is completed (or its day has passed), then the second trip.
  const rides: OverviewRide[] = upcoming.map((b) => {
    const roundtrip = Boolean(b.returnDate && b.returnTime);
    const onReturn = roundtrip && (firstDone.has(b.reference) || legOf(b.reference, "outbound")?.status === "completed" || b.pickupDate < today);
    const leg = onReturn ? "return" as const : "outbound" as const;
    const a = legOf(b.reference, leg);
    return {
      reference: b.reference, pickupDate: onReturn ? b.returnDate! : b.pickupDate, pickupTime: onReturn ? b.returnTime! : b.pickupTime,
      pickup: onReturn ? b.returnPickup || b.dropoff : b.pickup, dropoff: onReturn ? b.returnDropoff || b.pickup : b.dropoff,
      name: fullName(b.customerName, b.customerSurname), vehicle: b.vehicle, passengers: b.passengers, luggage: b.luggage, status: b.status, paymentMethod: b.paymentMethod, paymentStatus: b.paymentStatus,
      total: b.total, flightNumber: onReturn ? null : b.flightNumber, flightStatus: onReturn ? null : b.flightStatus, driver: a?.driver ?? null, driverId: a?.driverId ?? null, driverStatus: a?.status ?? null,
      attention: b.attentionStatus === "attention",
      roundtrip, leg,
      edit: editableFrom(b),
    };
  }).sort((x, y) => `${x.pickupDate} ${x.pickupTime}`.localeCompare(`${y.pickupDate} ${y.pickupTime}`));
  // Customer link, driver link (once assigned) and driver cost for the nearest rides shown in Upcoming rides.
  const near = rides.slice(0, 20);
  const created = new Map(upcoming.map((b) => [b.reference, b.createdAt]));
  const costs = near.length ? await db.select({ ref: bookingCosts.bookingReference, cost: bookingCosts.totalDriverCost }).from(bookingCosts).where(inArray(bookingCosts.bookingReference, near.map((r) => r.reference))).catch(() => []) : [];
  await Promise.all(near.map(async (r) => {
    r.rideUrl = r.status === "confirmed" ? await rideUrl(SITE_URL, { reference: r.reference, createdAt: created.get(r.reference)! }).catch(() => null) : null;
    r.driverUrl = await assignedDriverUrl(r.reference, r.leg ?? "outbound").catch(() => null);
    r.cost = costs.find((c) => c.ref === r.reference)?.cost ?? null;
  }));
  const pickupAt = (r: OverviewRide) => new Date(`${r.pickupDate}T${r.pickupTime}:00+07:00`);
  const unassignedSoon = rides.filter((r) => r.status === "confirmed" && !r.driver && pickupAt(r) <= soon);

  // Key numbers, by the Bangkok day each booking was made.
  const days = Array.from({ length: 30 }, (_, i) => bangkokDate(i - 29, at));
  const byDay = new Map(days.map((d) => [d, { bookings: 0, revenue: 0 }]));
  let cancelled7 = 0, cancelled30 = 0;
  for (const r of recent) {
    const day = bangkokDate(0, new Date(r.createdAt));
    const slot = byDay.get(day);
    if (!slot) continue;
    if (r.status === "cancelled" || r.status === "refunded") {
      cancelled30 += 1;
      if (day >= days[23]) cancelled7 += 1;
      continue;
    }
    slot.bookings += 1;
    if (r.status === "confirmed" || r.status === "completed") slot.revenue += r.total;
  }
  const trend = days.map((d) => ({ day: d, ...byDay.get(d)! }));
  const sumOver = (from: number) => trend.slice(from).reduce((acc, d) => ({ bookings: acc.bookings + d.bookings, revenue: acc.revenue + d.revenue }), { bookings: 0, revenue: 0 });
  const period = (from: number, cancelled: number | null) => { const s = sumOver(from); return { ...s, average: s.bookings ? Math.round(s.revenue / s.bookings) : 0, cancelled }; };

  return {
    today, tomorrow, rides,
    drivers: driverList.map(({ photoKey, ...d }) => ({ ...d, hasPhoto: Boolean(photoKey), plate: d.carPlate ?? null, area: d.driverType === "outsource" ? "Outsource" : d.area })),
    stats: { today: period(29, null), week: period(23, cancelled7), month: period(0, cancelled30) },
    cashDue: { count: cashDue[0]?.n ?? 0, amount: Number(cashDue[0]?.sum ?? 0) },
    trend,
    alerts: {
      unassignedSoon: unassignedSoon.length,
      attention: attention[0]?.n ?? 0,
      changeRequests: changeRequests[0]?.n ?? 0,
      operationsAlerts: openAlerts[0]?.n ?? 0,
      ticketsToArrange: tickets[0]?.n ?? 0,
      agencyApplications: agencyNew[0]?.n ?? 0,
      driverApplications: driverNew[0]?.n ?? 0,
    },
  };
}
export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;

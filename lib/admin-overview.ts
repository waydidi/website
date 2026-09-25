import { and, count, eq, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agencyApplications, bookingAssignments, bookingChangeRequests, bookings, driverApplications, drivers,
  memberBoxes, operationsAlerts,
} from "@/db/schema";

// Bookings that never became real trips.
const DEAD = ["expired", "payment_failed"];
const LIVE = ["pending_payment", "confirmed", "completed"];

/** YYYY-MM-DD in Bangkok, `offset` days from today. */
export function bangkokDate(offset = 0, at = new Date()) {
  return new Date(at.getTime() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

export type OverviewRide = {
  reference: string; pickupDate: string; pickupTime: string; pickup: string; dropoff: string; name: string;
  vehicle: string; status: string; paymentMethod: string; total: number; flightNumber: string | null; flightStatus: string | null;
  driver: string | null; driverStatus: string | null; attention: boolean;
};

export async function adminOverview(at = new Date()) {
  const db = getDb();
  const today = bangkokDate(0, at);
  const tomorrow = bangkokDate(1, at);
  const since30 = new Date(at.getTime() - 30 * 86_400_000).toISOString();
  const soon = new Date(at.getTime() + 24 * 3600_000);

  // Everything below is independent, so it runs at the same time.
  const [upcoming, recent, cashDue, changeRequests, openAlerts, tickets, agencyNew, driverNew, attention] = await Promise.all([
    // Only the columns shown: the bookings table is at D1's 100-column limit, so
    // selecting all of it plus the joined columns would fail.
    db.select({
      b: {
        reference: bookings.reference, pickupDate: bookings.pickupDate, pickupTime: bookings.pickupTime, pickup: bookings.pickup, dropoff: bookings.dropoff,
        customerName: bookings.customerName, customerSurname: bookings.customerSurname, vehicle: bookings.vehicle, status: bookings.status,
        paymentMethod: bookings.paymentMethod, total: bookings.total, flightNumber: bookings.flightNumber, flightStatus: bookings.flightStatus, attentionStatus: bookings.attentionStatus,
      },
      driver: drivers.fullName, driverStatus: bookingAssignments.currentStatus,
    }).from(bookings)
      .leftJoin(bookingAssignments, and(eq(bookingAssignments.bookingReference, bookings.reference), isNull(bookingAssignments.revokedAt)))
      .leftJoin(drivers, eq(drivers.id, bookingAssignments.driverId))
      .where(and(gte(bookings.pickupDate, today), lte(bookings.pickupDate, tomorrow), inArray(bookings.status, ["pending_payment", "confirmed"]), isNull(bookings.binnedAt)))
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

  const rides: OverviewRide[] = upcoming.map(({ b, driver, driverStatus }) => ({
    reference: b.reference, pickupDate: b.pickupDate, pickupTime: b.pickupTime, pickup: b.pickup, dropoff: b.dropoff,
    name: `${b.customerName} ${b.customerSurname ?? ""}`.trim(), vehicle: b.vehicle, status: b.status, paymentMethod: b.paymentMethod,
    total: b.total, flightNumber: b.flightNumber, flightStatus: b.flightStatus, driver: driver ?? null, driverStatus: driverStatus ?? null,
    attention: b.attentionStatus === "attention",
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

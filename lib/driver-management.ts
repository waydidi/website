import { and, desc, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookings, driverApplications, drivers } from "@/db/schema";
import { bangkokDate } from "@/lib/admin-overview";

export type DriverRow = {
  kind: "driver"; id: string; name: string; phone: string; email: string | null; area: string; vehicle: string;
  joined: string; status: string; trips: number; hasId: boolean; hasCar: boolean;
};
export type ApplicationRow = {
  kind: "application"; id: string; name: string; phone: string; email: string; area: string; vehicle: string;
  joined: string; status: string; applicantType: string; fleetSize: string | null; languages: string | null; message: string | null; vehicleYear: string | null;
};

// Everything the Driver management page shows: saved drivers, applications from /drivers, and the four numbers on top.
export async function driverManagement(at = new Date()) {
  const db = getDb();
  const today = bangkokDate(0, at);
  const in7 = bangkokDate(7, at);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [driverRows, appRows, assignRows, upcoming] = await Promise.all([
    db.select({ id: drivers.id, fullName: drivers.fullName, phone: drivers.phone, email: drivers.email, baseLocation: drivers.baseLocation, vehicle: drivers.vehicle, status: drivers.status, createdAt: drivers.createdAt, idImageKey: drivers.idImageKey, carImageKey: drivers.carImageKey }).from(drivers).orderBy(desc(drivers.createdAt)),
    db.select().from(driverApplications).orderBy(desc(driverApplications.createdAt)).limit(500).catch(() => []),
    db.select({ driverId: bookingAssignments.driverId, bookingReference: bookingAssignments.bookingReference }).from(bookingAssignments).where(isNull(bookingAssignments.revokedAt)),
    db.select({ reference: bookings.reference, pickupDate: bookings.pickupDate }).from(bookings)
      .where(and(inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.pickupDate, monthStart < today ? monthStart : today), lte(bookings.pickupDate, in7), isNull(bookings.binnedAt))),
  ]);
  const trips = new Map<string, number>();
  for (const a of assignRows) trips.set(a.driverId, (trips.get(a.driverId) ?? 0) + 1);
  const assigned = new Set(assignRows.map((a) => a.bookingReference));
  const tripsThisMonth = upcoming.filter((b) => b.pickupDate >= monthStart && b.pickupDate <= today && assigned.has(b.reference)).length;
  const unassignedNext7 = upcoming.filter((b) => b.pickupDate >= today && b.pickupDate <= in7 && !assigned.has(b.reference)).length;

  const driverList: DriverRow[] = driverRows.map((d) => ({
    kind: "driver", id: d.id, name: d.fullName, phone: d.phone, email: d.email, area: d.baseLocation, vehicle: d.vehicle,
    joined: d.createdAt, status: d.status, trips: trips.get(d.id) ?? 0, hasId: Boolean(d.idImageKey), hasCar: Boolean(d.carImageKey),
  }));
  const applications: ApplicationRow[] = appRows.map((r) => ({
    kind: "application", id: r.id, name: r.fullName, phone: r.phone, email: r.email, area: r.city, vehicle: r.vehicle,
    joined: r.createdAt, status: r.status, applicantType: r.applicantType, fleetSize: r.fleetSize, languages: r.languages, message: r.message, vehicleYear: r.vehicleYear,
  }));
  return {
    drivers: driverList, applications,
    stats: {
      total: driverList.length, active: driverList.filter((d) => d.status === "active").length,
      toReview: applications.filter((a) => a.status === "new").length, applications: applications.length,
      tripsThisMonth, unassignedNext7,
    },
  };
}
export type DriverManagement = Awaited<ReturnType<typeof driverManagement>>;

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { agencyApplications, smartTrips } from "@/db/schema";

export const commissionOf = (t: { total: number; commissionPercent: number }) => Math.round((t.total * t.commissionPercent) / 100);

/** Paid agency trips with the commission each one earns, grouped by agency. */
export async function commissionReport() {
  const rows = await getDb().select().from(smartTrips)
    .where(and(eq(smartTrips.status, "accepted"), isNotNull(smartTrips.agencyId))).orderBy(desc(smartTrips.tripDate));
  const agencies = await getDb().select({ id: agencyApplications.id, name: agencyApplications.agencyName, email: agencyApplications.email }).from(agencyApplications);
  const byAgency = new Map<string, { id: string; name: string; email: string; owed: number; paid: number; trips: { id: string; ref: string; title: string; tripDate: string | null; total: number; percent: number; commission: number; paidAt: string | null; bookingReference: string | null }[] }>();
  for (const t of rows) {
    const a = agencies.find((x) => x.id === t.agencyId);
    const entry = byAgency.get(t.agencyId!) ?? { id: t.agencyId!, name: a?.name ?? "Unknown agency", email: a?.email ?? "", owed: 0, paid: 0, trips: [] };
    const commission = commissionOf(t);
    entry.trips.push({ id: t.id, ref: t.ref, title: t.title, tripDate: t.tripDate, total: t.total, percent: t.commissionPercent, commission, paidAt: t.commissionPaidAt, bookingReference: t.bookingReference });
    if (t.commissionPaidAt) entry.paid += commission; else entry.owed += commission;
    byAgency.set(t.agencyId!, entry);
  }
  return [...byAgency.values()].sort((a, b) => b.owed - a.owed);
}

export async function markCommissionPaid(tripIds: string[], paid: boolean) {
  if (!tripIds.length) return 0;
  const rows = await getDb().update(smartTrips).set({ commissionPaidAt: paid ? new Date().toISOString() : null })
    .where(and(inArray(smartTrips.id, tripIds), eq(smartTrips.status, "accepted"), isNotNull(smartTrips.agencyId))).returning({ id: smartTrips.id });
  return rows.length;
}

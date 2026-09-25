import { and, count, eq, gte, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, customerBookingLinks } from "@/db/schema";
import { memberTier } from "./member-tier-rules";
export * from "./member-tier-rules";

// Completed rides and their spend over the last 12 months decide the tier.
export async function memberTierStatus(customerId: string) {
  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [row] = await getDb().select({ n: count(), spend: sum(bookings.total) }).from(bookings)
    .innerJoin(customerBookingLinks, eq(customerBookingLinks.bookingReference, bookings.reference))
    .where(and(eq(customerBookingLinks.customerId, customerId), eq(bookings.status, "completed"), gte(bookings.pickupDate, since)));
  return memberTier(row?.n ?? 0, Number(row?.spend ?? 0));
}

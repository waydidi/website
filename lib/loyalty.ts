import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, customerBookingLinks, promoRedemptions } from "@/db/schema";

import { LOYALTY_CODE, loyaltyProgress } from "./loyalty-rules";
export * from "./loyalty-rules";

export async function loyaltyStatus(customerId: string) {
  const db = getDb();
  const [done] = await db.select({ n: count() }).from(bookings)
    .innerJoin(customerBookingLinks, eq(customerBookingLinks.bookingReference, bookings.reference))
    .where(and(eq(customerBookingLinks.customerId, customerId), eq(bookings.status, "completed")));
  const [used] = await db.select({ n: count() }).from(promoRedemptions)
    .innerJoin(bookings, eq(bookings.reference, promoRedemptions.bookingReference))
    .where(and(eq(promoRedemptions.customerId, customerId), eq(promoRedemptions.code, LOYALTY_CODE), notInArray(bookings.status, ["expired", "payment_failed"])));
  return loyaltyProgress(done?.n ?? 0, used?.n ?? 0);
}

export async function loyaltyUsedOn(references: string[]) {
  if (!references.length) return new Set<string>();
  const rows = await getDb().select({ ref: promoRedemptions.bookingReference }).from(promoRedemptions).where(and(inArray(promoRedemptions.bookingReference, references), eq(promoRedemptions.code, LOYALTY_CODE)));
  return new Set(rows.map((r) => r.ref));
}

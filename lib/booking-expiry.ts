import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingEvents, bookingPayments, bookings } from "@/db/schema";

export const ABANDONED_CHECKOUT_AGE_MS = 24 * 60 * 60 * 1000;

export function abandonedCheckoutState(now: string) {
  return {
    status: "expired",
    paymentStatus: "expired",
    paymentStatusUpdatedAt: now,
    reconciliationStatus: "resolved",
    updatedAt: now,
  } as const;
}

/**
 * Retains abandoned checkout records for audit and late provider reconciliation.
 * Processing payments are deliberately excluded because asynchronous methods can
 * remain open beyond the normal Checkout Session lifetime.
 */
export async function expireAbandonedCheckouts(now = new Date()) {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - ABANDONED_CHECKOUT_AGE_MS).toISOString();
  const stale = await getDb()
    .select({ reference: bookings.reference })
    .from(bookings)
    .where(and(
      eq(bookings.status, "pending_payment"),
      eq(bookings.paymentStatus, "pending"),
      lt(bookings.createdAt, cutoff),
    ))
    .limit(100);

  let expired = 0;
  for (const row of stale) {
    const [updated] = await getDb()
      .update(bookings)
      .set(abandonedCheckoutState(nowIso))
      .where(and(
        eq(bookings.reference, row.reference),
        eq(bookings.status, "pending_payment"),
        eq(bookings.paymentStatus, "pending"),
      ))
      .returning({ reference: bookings.reference });
    if (!updated) continue;
    expired += 1;
    await getDb().update(bookingPayments).set({ status: "expired", providerStatus: "expired", reconciliationStatus: "resolved", updatedAt: nowIso }).where(eq(bookingPayments.id, `primary:${updated.reference}`));
    await getDb().insert(bookingEvents).values({
      bookingReference: updated.reference,
      eventType: "checkout_expired",
      providerEventId: `checkout-expired:${updated.reference}`,
      createdAt: nowIso,
    }).onConflictDoNothing();
  }
  return expired;
}

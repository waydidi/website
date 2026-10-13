import { sql } from "drizzle-orm";
import { toSatang } from "./money";
import { getDb } from "@/db";
import { bookingPayments, bookings } from "@/db/schema";
import { unifiedPaymentValues } from "@/lib/payment-model";

/** Lazily normalizes legacy Stripe/cash rows without putting data changes in a schema migration. */
export async function backfillUnifiedPaymentFields(limit = 100) {
  // Only bookings still without their payment row: normally none, so the admin Bookings page costs one cheap read.
  const rows = await getDb().select().from(bookings).where(sql`NOT EXISTS (SELECT 1 FROM booking_payments p WHERE p.id = 'primary:' || ${bookings.reference})`).limit(limit);
  for (const row of rows) {
    await getDb().insert(bookingPayments).values({
      id: `primary:${row.reference}`,
      bookingReference: row.reference,
      ...unifiedPaymentValues(row),
      amountPaid: row.amountPaid,
      amountPaidMinor: toSatang(row.amountPaid),
      currency: row.paymentCurrency,
      failureCode: row.paymentFailureCode,
      failureMessage: row.paymentFailureMessage,
      reconciliationStatus: row.reconciliationStatus,
      reconciliationAttempts: row.reconciliationAttempts,
      lastCheckedAt: row.lastPaymentCheckedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }).onConflictDoNothing();
  }
  return rows.length;
}

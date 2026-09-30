import { and, asc, eq, isNotNull, isNull, lt, or, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { expireAbandonedCheckouts } from "@/lib/booking-expiry";
import { reconcileBooking } from "@/lib/payment-reconciliation";
export async function runPaymentRecovery(at = new Date()) {
    const before = new Date(at.getTime() - 5 * 60000).toISOString();
    // Oldest checked first, bounded work per five-minute cron run. Paid bookings
    // are revisited daily to catch missed refund and dispute webhooks.
    const daily = new Date(at.getTime() - 86400000).toISOString();
    const rows = await getDb().select().from(bookings).where(and(eq(bookings.paymentMethod, "stripe"), isNotNull(bookings.checkoutSessionId), or(and(inArray(bookings.paymentStatus, ["pending", "processing", "failed"]), or(isNull(bookings.lastPaymentCheckedAt), lt(bookings.lastPaymentCheckedAt, before))), and(eq(bookings.reconciliationStatus, "pending"), or(isNull(bookings.lastPaymentCheckedAt), lt(bookings.lastPaymentCheckedAt, before))), and(inArray(bookings.paymentStatus, ["paid", "partially_refunded", "disputed", "expired"]), or(isNull(bookings.lastPaymentCheckedAt), lt(bookings.lastPaymentCheckedAt, daily), eq(bookings.fulfillmentStatus, "failed")))))).orderBy(asc(bookings.lastPaymentCheckedAt)).limit(15);
    let recovered = 0;
    let failed = 0;
    async function recover(row: typeof rows[number]) {
        try {
            const result = await reconcileBooking(row.reference, "scheduled");
            if (result.status === "paid" && row.paymentStatus !== "paid") recovered++;
            if (result.status === "expired")
                await getDb().update(bookings).set({ status: "expired", updatedAt: at.toISOString() }).where(and(eq(bookings.reference, row.reference), eq(bookings.status, "pending_payment"), eq(bookings.paymentStatus, "expired")));
        }
        catch {
            failed++;
            await getDb().update(bookings).set({ lastPaymentCheckedAt: at.toISOString(), reconciliationAttempts: row.reconciliationAttempts + 1 }).where(eq(bookings.reference, row.reference));
        }
    }
    for(let i=0;i<rows.length;i+=3) await Promise.all(rows.slice(i,i+3).map(recover));
    const expired = await expireAbandonedCheckouts(at);
    return { scanned: rows.length, recovered, failed, expired };
}

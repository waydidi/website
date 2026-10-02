import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, operationsAlerts } from "@/db/schema";
async function stripeGet(path: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok)
        throw new Error("STRIPE_FINANCIAL_DETAILS_UNAVAILABLE");
    return res.json();
}
export async function reconcileStripeFinance(reference: string, intentId: string) {
    if (!env.STRIPE_SECRET_KEY || !/^pi_[A-Za-z0-9_]+$/.test(intentId))
        throw new Error("STRIPE_NOT_CONFIGURED");
    const intent = await stripeGet(`payment_intents/${encodeURIComponent(intentId)}?expand[]=latest_charge.balance_transaction`) as {
        currency: string;
        amount_received: number;
        latest_charge?: {
            amount: number;
            amount_refunded: number;
            currency: string;
            balance_transaction?: {
                fee: number;
                currency: string;
            };
        };
    };
    if (!intent.latest_charge || typeof intent.latest_charge !== "object")
        return;
    const charge = intent.latest_charge;
    const disputes = await stripeGet(`disputes?payment_intent=${encodeURIComponent(intentId)}&limit=100`) as {
        data: Array<{
            status: string;
            amount: number;
        }>;
        has_more: boolean;
    };
    if (disputes.has_more)
        throw new Error("STRIPE_DISPUTE_HISTORY_INCOMPLETE");
    const dispute = disputes.data.find(d => !["won", "warning_closed"].includes(d.status));
    const status = dispute ? "disputed" : charge.amount_refunded >= charge.amount ? "refunded" : charge.amount_refunded > 0 ? "partially_refunded" : "paid";
    const now = new Date().toISOString();
    const [b] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!b || b.paymentIntentId !== intentId || intent.currency !== "thb" || charge.currency !== "thb" || charge.amount !== b.total * 100 || intent.amount_received !== b.total * 100)
        throw new Error("STRIPE_FINANCIAL_DETAILS_MISMATCH");
    const feeMinor = charge.balance_transaction?.currency === "thb" && Number.isSafeInteger(charge.balance_transaction.fee) ? charge.balance_transaction.fee : null;
    // Monetary totals are monotonic. An older provider read must not undo a
    // refund already recorded by a newer webhook. A dispute clears only when
    // the provider supplies a closed, won dispute history.
    const pstatus = dispute ? "disputed" : disputes.data.length ? status : b.paymentStatus === "disputed" ? "disputed" : status;
    await env.DB.batch([
        env.DB.prepare(`UPDATE booking_payments SET status=?,provider_status=?,amount_paid=?,amount_paid_minor=?,refunded_minor=?,fee_minor=?,dispute_status=?,last_checked_at=?,updated_at=? WHERE id=? AND refunded_minor<=? AND (status!='disputed' OR ?='disputed' OR ?=1)`).bind(pstatus, pstatus, intent.amount_received / 100, intent.amount_received, charge.amount_refunded, feeMinor, dispute?.status ?? (disputes.data.length ? "won" : null), now, now, `primary:${reference}`, charge.amount_refunded, pstatus, disputes.data.length ? 1 : 0),
        env.DB.prepare(`UPDATE bookings SET payment_status=(SELECT status FROM booking_payments WHERE id=?),refund_amount=(SELECT refunded_minor/100.0 FROM booking_payments WHERE id=?),payment_status_updated_at=?,last_payment_checked_at=?,reconciliation_status='matched',updated_at=? WHERE reference=? AND payment_intent_id=? AND EXISTS(SELECT 1 FROM booking_payments WHERE id=?)`).bind(`primary:${reference}`, `primary:${reference}`, now, now, now, reference, intentId, `primary:${reference}`),
    ]);
    if (dispute)
        await getDb().insert(operationsAlerts).values({ id: crypto.randomUUID(), bookingReference: reference, alertType: "payment_disputed", severity: "critical", title: "Stripe dispute needs review", details: "Review the payment and journey evidence in Stripe.", dedupeKey: `payment_disputed:${reference}`, status: "open", detectedAt: now, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: operationsAlerts.dedupeKey, set: { status: "open", detectedAt: now, updatedAt: now } });
    if (!dispute)
        await getDb().update(operationsAlerts).set({ status: "resolved", resolvedAt: now, resolutionNote: "Provider reports dispute resolved.", updatedAt: now }).where(eq(operationsAlerts.dedupeKey, `payment_disputed:${reference}`));
}

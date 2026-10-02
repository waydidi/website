import { env } from "cloudflare:workers";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingPayments, bookingRefunds, bookings, cashReceipts } from "@/db/schema";
import { paymentProviderFor } from "@/lib/payments/provider";
import type { PaymentProvider } from "@/lib/payment-model";
import { REFUND_POLICY_VERSION, customerRefundMinor, describeRefund, noticeHours, serviceStartMs, type RefundReason } from "@/lib/refund-policy";

// Server-side refund flow: quote → admin confirmation → refund record → provider
// request → webhook/reconciliation → refunded. Amounts are never taken from the browser.

const ACTIVE = ["requested", "approved", "processing", "refunded", "partially_refunded"];
type Refund = typeof bookingRefunds.$inferSelect;

/** What the policy allows for this booking right now (or at the given request time). */
export async function quoteRefund(reference: string, reason: RefundReason, requestedAtIso = new Date().toISOString()) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return { error: "Booking not found." } as const;
  const requestedAt = Date.parse(requestedAtIso);
  if (!Number.isFinite(requestedAt)) return { error: "Invalid cancellation request time." } as const;

  // What was actually received: card payments from the payment record, cash from receipts.
  const [payment] = await getDb().select().from(bookingPayments).where(eq(bookingPayments.bookingReference, reference)).orderBy(desc(bookingPayments.updatedAt)).limit(1);
  const cash = booking.paymentMethod === "cash" || payment?.provider === "cash";
  const paidMinor = cash
    ? (await getDb().select({ m: cashReceipts.amountMinor }).from(cashReceipts).where(eq(cashReceipts.bookingReference, reference))).reduce((t, r) => t + r.m, 0)
    : payment && ["paid", "partially_refunded", "refunded"].includes(payment.status) ? payment.amountPaid : 0;
  const records = await getDb().select().from(bookingRefunds).where(and(eq(bookingRefunds.bookingReference, reference), inArray(bookingRefunds.status, ACTIVE)));
  const alreadyMinor = Math.max(payment?.refundedMinor ?? 0, records.reduce((t, r) => t + r.customerRefundMinor, 0));

  const hours = noticeHours(serviceStartMs(booking.pickupDate, booking.pickupTime), requestedAt);
  const { percent, window } = describeRefund(reason, hours);
  const amountMinor = customerRefundMinor(paidMinor, percent, alreadyMinor);
  return {
    reference, reason, window, percent, noticeHours: Math.round(hours * 10) / 10,
    provider: (cash ? "cash" : payment?.provider ?? "stripe") as PaymentProvider,
    paymentId: payment?.id ?? null, providerTransactionId: cash ? null : payment?.providerTransactionId ?? booking.paymentIntentId ?? null,
    paidMinor, alreadyRefundedMinor: alreadyMinor, refundableMinor: Math.max(0, paidMinor - alreadyMinor), amountMinor,
    serviceAt: `${booking.pickupDate} ${booking.pickupTime}`, requestedAt: new Date(requestedAt).toISOString(),
    paymentStatus: payment?.status ?? booking.paymentStatus, policyVersion: REFUND_POLICY_VERSION,
  } as const;
}

/** Admin-confirmed refund. The idempotency key makes a repeated click return the same refund. */
export async function createRefund(input: { reference: string; reason: RefundReason; requestedAt: string; idempotencyKey: string; admin: string; note?: string; providerFeeMinor?: number }) {
  const [existing] = await getDb().select().from(bookingRefunds).where(eq(bookingRefunds.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) return { refund: existing, duplicate: true } as const;
  const q = await quoteRefund(input.reference, input.reason, input.requestedAt);
  if ("error" in q) return { error: q.error } as const;
  if (q.amountMinor <= 0) return { error: q.paidMinor === 0 ? "Nothing has been paid for this booking, so there is nothing to refund." : "The policy gives no refund for this cancellation (or it is already fully refunded)." } as const;
  if (q.provider !== "cash" && !q.providerTransactionId) return { error: "This payment has no provider transaction to refund." } as const;

  const now = new Date().toISOString(), id = crypto.randomUUID();
  // Insert only if the new total stays within what was paid — checked in the same statement.
  const inserted = await env.DB.prepare(`INSERT INTO booking_refunds (id, booking_reference, payment_id, provider, provider_transaction_id, idempotency_key, reason, note, policy_version, cancellation_requested_at, notice_hours, refund_percent, original_minor, customer_refund_minor, provider_refund_fee_minor, currency, status, requested_by, approved_by, approved_at, created_at, updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'thb', 'approved', ?, ?, ?, ?, ?
    WHERE (SELECT COALESCE(SUM(customer_refund_minor),0) FROM booking_refunds WHERE booking_reference = ? AND status IN ('requested','approved','processing','refunded','partially_refunded')) + ? <= ?`)
    .bind(id, q.reference, q.paymentId, q.provider, q.providerTransactionId, input.idempotencyKey, q.reason, input.note ?? null, q.policyVersion, q.requestedAt, q.noticeHours, q.percent, q.paidMinor, q.amountMinor, Math.max(0, Math.round(input.providerFeeMinor ?? 0)),
      input.admin, input.admin, now, now, now, q.reference, q.amountMinor, q.paidMinor).run().catch((e: unknown) => {
      if (String(e).includes("UNIQUE")) return { meta: { changes: 0 } };
      throw e;
    });
  if ((inserted.meta.changes ?? 0) !== 1) {
    const [again] = await getDb().select().from(bookingRefunds).where(eq(bookingRefunds.idempotencyKey, input.idempotencyKey)).limit(1);
    return again ? { refund: again, duplicate: true } as const : { error: "This refund would exceed the amount paid." } as const;
  }
  await getDb().update(bookings).set({ refundStatus: "processing", refundAmount: Math.round(q.amountMinor / 100), refundRequestedAt: q.requestedAt, updatedAt: now }).where(eq(bookings.reference, q.reference));

  if (q.provider === "cash") {
    // Cash goes back by hand: the admin's confirmation is the completion record.
    await finish(id, q.reference, "refunded", "cash_returned", null);
  } else {
    try {
      const provider = paymentProviderFor(q.provider);
      const result = await provider.refundPayment({ paymentId: q.providerTransactionId!, reference: q.reference, amountMinor: q.amountMinor, reason: q.reason, idempotencyKey: `waydidi-refund-${input.idempotencyKey}` });
      // Submitted ≠ completed: stays "processing" until the provider confirms.
      await getDb().update(bookingRefunds).set({ status: "processing", providerRefundId: result.id, providerStatus: result.status, updatedAt: new Date().toISOString() }).where(eq(bookingRefunds.id, id));
      await reconcileRefunds(q.reference);
    } catch (error) {
      await finish(id, q.reference, "failed", "submit_failed", error instanceof Error ? error.message : String(error));
    }
  }
  const [refund] = await getDb().select().from(bookingRefunds).where(eq(bookingRefunds.id, id)).limit(1);
  return { refund, duplicate: false } as const;
}

async function finish(id: string, reference: string, status: "refunded" | "failed", providerStatus: string, failure: string | null) {
  const now = new Date().toISOString();
  await getDb().update(bookingRefunds).set({ status, providerStatus, failureMessage: failure, completedAt: status === "refunded" ? now : null, updatedAt: now }).where(eq(bookingRefunds.id, id));
  await syncBookingRefund(reference);
}

/** Booking-level summary kept in step with the refund records. */
async function syncBookingRefund(reference: string) {
  const rows = await getDb().select().from(bookingRefunds).where(eq(bookingRefunds.bookingReference, reference));
  if (!rows.length) return;
  const done = rows.filter((r) => r.status === "refunded");
  const pending = rows.some((r) => ["approved", "processing", "requested"].includes(r.status));
  const refundedMinor = done.reduce((t, r) => t + r.customerRefundMinor, 0);
  const paid = rows[0].originalMinor;
  const status = pending ? "processing" : refundedMinor === 0 ? (rows.some((r) => r.status === "failed") ? "failed" : null) : refundedMinor >= paid ? "refunded" : "partially_refunded";
  const last = done.map((r) => r.completedAt ?? "").sort().pop() || null;
  await getDb().update(bookings).set({ refundStatus: status, refundAmount: Math.round(refundedMinor / 100), refundCompletedAt: status === "refunded" || status === "partially_refunded" ? last : null, updatedAt: new Date().toISOString() }).where(eq(bookings.reference, reference));
}

/** Ask the provider how each in-flight refund is doing (called from webhooks and the admin). */
export async function reconcileRefunds(reference: string) {
  const rows = await getDb().select().from(bookingRefunds).where(and(eq(bookingRefunds.bookingReference, reference), eq(bookingRefunds.status, "processing")));
  for (const r of rows as Refund[]) {
    if (!r.providerRefundId || r.provider === "cash") continue;
    try {
      const status = (await paymentProviderFor(r.provider as PaymentProvider).retrieveRefund(r.providerRefundId)).status;
      if (status === "succeeded") await finish(r.id, reference, "refunded", status, null);
      else if (status === "failed" || status === "canceled") await finish(r.id, reference, "failed", status, `Provider reported ${status}.`);
      else await getDb().update(bookingRefunds).set({ providerStatus: status, updatedAt: new Date().toISOString() }).where(eq(bookingRefunds.id, r.id));
    } catch (error) { console.error("Refund reconciliation failed", r.id, error); }
  }
  await syncBookingRefund(reference);
}

export async function refundsFor(reference: string) {
  return getDb().select().from(bookingRefunds).where(eq(bookingRefunds.bookingReference, reference)).orderBy(desc(bookingRefunds.createdAt));
}

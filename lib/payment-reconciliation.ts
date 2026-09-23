import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingEvents, bookingPayments, bookings, operationsAlerts } from "@/db/schema";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import { legacyPaymentProvider } from "@/lib/payment-model";
import { paymentProviderFor } from "@/lib/payments/provider";
import type { ProviderPaymentSession } from "@/lib/payments/types";

type Booking = typeof bookings.$inferSelect;
export type ReconciliationSource = "webhook" | "customer_return" | "admin" | "scheduled";

async function alert(booking: Booking, type: string, title: string, details: string) {
  const now = new Date().toISOString();
  await getDb().insert(operationsAlerts).values({
    id: crypto.randomUUID(), bookingReference: booking.reference, alertType: type, severity: "critical",
    title, details, dedupeKey: `${type}:${booking.reference}`, status: "open", detectedAt: now,
    createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({ target: operationsAlerts.dedupeKey, set: { status: "open", details, detectedAt: now, updatedAt: now } });
}

async function record(reference: string, eventType: string, providerEventId: string) {
  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType, providerEventId, createdAt: new Date().toISOString() }).onConflictDoNothing();
}

export async function reconcilePaymentSession(booking: Booking, session: ProviderPaymentSession, source: ReconciliationSource) {
  const now = new Date().toISOString();
  const attempts = booking.reconciliationAttempts + 1;
  const mismatch = !session.sessionId || session.sessionId !== booking.checkoutSessionId ||
    session.bookingReference !== booking.reference || session.currency !== "thb" ||
    session.amountMinor !== booking.total * 100;
  if (mismatch) {
    await getDb().update(bookings).set({ reconciliationStatus: "mismatch", reconciliationAttempts: attempts, lastPaymentCheckedAt: now, updatedAt: now }).where(eq(bookings.reference, booking.reference));
    await getDb().update(bookingPayments).set({ reconciliationStatus: "mismatch", reconciliationAttempts: attempts, lastCheckedAt: now, updatedAt: now }).where(eq(bookingPayments.id, `primary:${booking.reference}`));
    await alert(booking, "payment_mismatch", "Provider payment does not match booking", `Source: ${source}. The session, amount, currency, or booking reference did not match.`);
    return { status: "mismatch" as const, bookingStatus: booking.status };
  }
  const classifiedStatus = session.status;
  if (classifiedStatus === "paid") {
    await getDb().update(bookings).set({
      paymentStatus: "paid", paymentStatusUpdatedAt: now, amountPaid: booking.total,
      paymentCurrency: "thb", paymentIntentId: session.transactionId ?? booking.paymentIntentId,
      paymentFailureCode: null, paymentFailureMessage: null, lastPaymentCheckedAt: now,
      reconciliationStatus: "matched", reconciliationAttempts: attempts, updatedAt: now,
    }).where(eq(bookings.reference, booking.reference));
    await getDb().update(bookingPayments).set({ status: "paid", providerSessionId: session.sessionId, providerTransactionId: session.transactionId ?? booking.paymentIntentId, providerStatus: session.providerStatus ?? "paid", amountExpected: booking.total, amountPaid: booking.total, currency: "thb", failureCode: null, failureMessage: null, lastCheckedAt: now, reconciliationStatus: "matched", reconciliationAttempts: attempts, updatedAt: now }).where(eq(bookingPayments.id, `primary:${booking.reference}`));
    await record(booking.reference, `payment_reconciled_${source}`, `payment:${session.provider}:${session.sessionId}`);
    const [fresh] = await getDb().select().from(bookings).where(eq(bookings.reference, booking.reference)).limit(1);
    await fulfillBooking(fresh, session.transactionId ?? null);
    return { status: "paid" as const, bookingStatus: "confirmed" };
  }
  const paymentStatus = classifiedStatus;
  await getDb().update(bookings).set({
    paymentStatus, paymentStatusUpdatedAt: now, lastPaymentCheckedAt: now,
    reconciliationStatus: paymentStatus === "expired" ? "resolved" : "pending",
    reconciliationAttempts: attempts, updatedAt: now,
  }).where(eq(bookings.reference, booking.reference));
  await getDb().update(bookingPayments).set({ status: paymentStatus, providerSessionId: session.sessionId, providerStatus: session.providerStatus ?? paymentStatus, amountExpected: booking.total, lastCheckedAt: now, reconciliationStatus: paymentStatus === "expired" ? "resolved" : "pending", reconciliationAttempts: attempts, updatedAt: now }).where(eq(bookingPayments.id, `primary:${booking.reference}`));
  await record(booking.reference, `payment_${paymentStatus}`, `payment-status:${session.provider}:${session.sessionId}:${paymentStatus}`);
  return { status: paymentStatus, bookingStatus: booking.status };
}

export async function reconcileBooking(reference: string, source: ReconciliationSource) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return { status: "not_found" as const };
  if (booking.paymentMethod === "cash") return { status: "cash_due" as const, bookingStatus: booking.status };
  if (!booking.checkoutSessionId) {
    await alert(booking, "payment_session_missing", "Payment session is missing", "A card booking has no Stripe Checkout Session ID.");
    return { status: "missing_session" as const, bookingStatus: booking.status };
  }
  const provider = legacyPaymentProvider(booking.paymentMethod);
  const session = await paymentProviderFor(provider).retrievePayment(booking.checkoutSessionId);
  return reconcilePaymentSession(booking, session, source);
}

export const reconcileCheckoutSession = reconcilePaymentSession;

export async function markProviderFailure(reference: string, code: string, message: string, providerEventId: string) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return;
  const now = new Date().toISOString();
  await getDb().update(bookings).set({ paymentStatus: "failed", paymentStatusUpdatedAt: now, paymentFailureCode: code.slice(0, 100), paymentFailureMessage: message.slice(0, 300), reconciliationStatus: "resolved", lastPaymentCheckedAt: now, updatedAt: now }).where(eq(bookings.reference, reference));
  await getDb().update(bookingPayments).set({ status: "failed", providerStatus: "failed", failureCode: code.slice(0, 100), failureMessage: message.slice(0, 300), reconciliationStatus: "resolved", lastCheckedAt: now, updatedAt: now }).where(eq(bookingPayments.id, `primary:${reference}`));
  await record(reference, "payment_failed", providerEventId);
}

export async function updateRefundOrDispute(paymentIntentId: string, status: "refunded" | "partially_refunded" | "disputed", providerEventId: string) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.paymentIntentId, paymentIntentId)).limit(1);
  if (!booking) return;
  const now = new Date().toISOString();
  await getDb().update(bookings).set({ paymentStatus: status, paymentStatusUpdatedAt: now, reconciliationStatus: "matched", lastPaymentCheckedAt: now, updatedAt: now }).where(and(eq(bookings.reference, booking.reference), eq(bookings.paymentIntentId, paymentIntentId)));
  await getDb().update(bookingPayments).set({ status, providerStatus: status, providerTransactionId: paymentIntentId, reconciliationStatus: "matched", lastCheckedAt: now, updatedAt: now }).where(eq(bookingPayments.id, `primary:${booking.reference}`));
  await record(booking.reference, `payment_${status}`, providerEventId);
  if (status === "disputed") await alert(booking, "payment_disputed", "Stripe dispute opened", "Review the payment and supporting journey evidence in Stripe.");
}

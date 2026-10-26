import type { ProviderPaymentSession } from "./payments/types";
import { toSatang } from "./money";

export const PAYMENT_DISCREPANCY_LABELS = {
  session: "Checkout session differs from the booking",
  booking: "Provider booking reference differs",
  currency: "Provider currency is not THB",
  amount: "Provider amount differs from the booking total",
  transaction_missing: "Paid Stripe session has no transaction",
  transaction: "Provider transaction differs from the recorded payment",
} as const;
export type PaymentDiscrepancy = keyof typeof PAYMENT_DISCREPANCY_LABELS;

export function paymentDiscrepancies(booking: { reference: string; checkoutSessionId: string | null; total: number; paymentIntentId: string | null }, session: ProviderPaymentSession): PaymentDiscrepancy[] {
  const reasons: PaymentDiscrepancy[] = [];
  if (!session.sessionId || session.sessionId !== booking.checkoutSessionId) reasons.push("session");
  if (session.bookingReference !== booking.reference) reasons.push("booking");
  if (session.currency !== "thb") reasons.push("currency");
  if (!Number.isSafeInteger(session.amountMinor) || session.amountMinor !== toSatang(booking.total)) reasons.push("amount");
  if (session.status === "paid" && session.provider === "stripe" && !session.transactionId) reasons.push("transaction_missing");
  if (booking.paymentIntentId && session.transactionId && session.transactionId !== booking.paymentIntentId) reasons.push("transaction");
  return reasons;
}

export function canReviewPayments(role: string) { return role === "owner" || role === "finance"; }

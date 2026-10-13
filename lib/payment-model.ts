import { toSatang } from "./money";
import type { bookings } from "@/db/schema";
import { isOfflinePayment } from "./payment-methods";

export type PaymentProvider = "stripe" | "payso" | "cash";
export type UnifiedPaymentStatus = "pending" | "processing" | "paid" | "cash_due" | "failed" | "expired" | "refunded" | "partially_refunded" | "disputed";

type Booking = typeof bookings.$inferSelect;

export function legacyPaymentProvider(paymentMethod: string): PaymentProvider {
  // Cash and bank transfer are both recorded offline as cash receipts.
  if (isOfflinePayment(paymentMethod)) return "cash";
  if (paymentMethod === "payso") return "payso";
  return "stripe";
}

export function unifiedPaymentValues(booking: Pick<Booking, "paymentMethod" | "checkoutSessionId" | "paymentIntentId" | "paymentStatus" | "total">) {
  return {
    provider: legacyPaymentProvider(booking.paymentMethod),
    status: booking.paymentStatus,
    providerSessionId: booking.checkoutSessionId,
    providerTransactionId: booking.paymentIntentId,
    providerStatus: booking.paymentStatus,
    amountExpected: booking.total,
    amountExpectedMinor: toSatang(booking.total),
  };
}

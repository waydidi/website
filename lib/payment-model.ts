import type { bookings } from "@/db/schema";

export type PaymentProvider = "stripe" | "payso" | "cash";
export type UnifiedPaymentStatus = "pending" | "processing" | "paid" | "cash_due" | "failed" | "expired" | "refunded" | "partially_refunded" | "disputed";

type Booking = typeof bookings.$inferSelect;

export function legacyPaymentProvider(paymentMethod: string): PaymentProvider {
  if (paymentMethod === "cash") return "cash";
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
  };
}

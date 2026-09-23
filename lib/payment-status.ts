export type CheckoutStatusInput = { payment_status?: string; status?: string };

export function classifyCheckoutSession(session: CheckoutStatusInput) {
  if (session.payment_status === "paid") return "paid" as const;
  if (session.status === "expired") return "expired" as const;
  if (session.payment_status === "unpaid") return "pending" as const;
  return "processing" as const;
}

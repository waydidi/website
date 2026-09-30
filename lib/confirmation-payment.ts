/** Display provider state without treating an expired or refunded checkout as paid. */
export function confirmationPaymentLabel(method: string, status: string, total: number) {
  if (total === 0) return "Nothing to pay";
  if (status === "refunded") return "Refunded";
  if (status === "partially_refunded") return "Partly refunded";
  if (status === "disputed") return "Payment under review";
  if (status === "paid") return method === "cash" ? "Cash collected" : "Paid online";
  if (status === "failed") return "Payment unsuccessful";
  if (status === "expired") return "Payment session expired";
  if (method === "cash") return "Cash due at pickup";
  return "Payment confirmation pending";
}

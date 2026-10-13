// What each booking payment method means. Pure, so pages, emails, PDFs, Telegram and money
// code all read the same rules (tests/payment-methods.test.mjs).
//
//   stripe / payso  card or wallet paid online through a provider
//   manual          recorded as already paid when staff created the booking
//   cash            paid to the driver at pickup
//   transfer        bank transfer / PromptPay before the trip ("waiting for payment")
//
// Cash and transfer money is recorded as cash receipts (lib/cash-collection.ts) by staff or an
// approved slip, so both share the same guarded, append-only ledger.

export type OfflineMethod = "cash" | "transfer";
export const OFFLINE_PAYMENT_METHODS = ["cash", "transfer"] as const;
/** For raw SQL: `payment_method IN (${OFFLINE_METHODS_SQL})`. */
export const OFFLINE_METHODS_SQL = OFFLINE_PAYMENT_METHODS.map((m) => `'${m}'`).join(",");

/** Money arrives outside a card provider and is recorded as cash receipts. */
export const isOfflinePayment = (method: string): method is OfflineMethod => (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method);
/** The driver collects the balance in cash at pickup. Transfers are never collected by the driver. */
export const collectsCashAtPickup = (method: string) => method === "cash";
/** Payment status while an offline booking still has money due. */
export const unpaidStatusFor = (method: OfflineMethod) => (method === "transfer" ? "pending" : "cash_due");

/** Short customer-facing label: emails, PDFs, account pages. */
export function paymentLabel(method: string, status: string, total: number) {
  if (total === 0) return "Nothing to pay";
  if (method === "transfer") return status === "paid" ? "Paid by bank transfer" : "Waiting for payment (bank transfer)";
  if (method === "cash") return status === "paid" ? "Cash collected" : "Pay in cash";
  if (method === "manual") return "Paid";
  return "Paid online";
}

/** Short staff label in Thai: Telegram cards and job messages. */
export function paymentLabelThai(method: string, status: string) {
  if (method === "transfer") return status === "paid" ? "โอนแล้ว" : "รอชำระ (โอน) — ไม่ต้องเก็บเงินสด";
  if (method === "cash") return status === "paid" ? "เก็บเงินสดแล้ว" : "เงินสดวันเดินทาง";
  return "ชำระแล้ว";
}

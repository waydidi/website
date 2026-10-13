// Staff quick-book a filled customer form from LINE by replying with the price. Pure, so it is
// unit tested (tests/booking-edit.test.mjs).

export type QuickPayment = "cash" | "waiting";

// Words after the price that mean the customer pays by bank transfer before the trip.
const TRANSFER = /^(transfer|bank|banktransfer|promptpay|tf|โอน|โอนเงิน|รอโอน)$/iu;
const CASH = /^(cash|เงินสด|สด)$/iu;

/** "3400" or "3,400 THB" → cash; "3400 โอน" / "3400 transfer" → waiting for payment. */
export function parsePriceReply(text: string): { price: number; payment: QuickPayment } | null {
  const words = text.trim().replace(/[฿,]/g, "").replace(/\b(thb|baht)\b/giu, " ").split(/\s+/).filter(Boolean);
  if (!words.length || !/^\d{1,7}$/u.test(words[0])) return null;
  const rest = words.slice(1).join("");
  if (rest && !TRANSFER.test(rest) && !CASH.test(rest)) return null;
  return { price: Number(words[0]), payment: rest && TRANSFER.test(rest) ? "waiting" : "cash" };
}

/** Postback data on the price buttons: "book:<token>:<amount>[:waiting]". */
export function parseBookPostback(data: string): { token: string; price: number; payment: QuickPayment } | null {
  const [kind, token, amount, payment] = data.split(":");
  if (kind !== "book" || !token || !/^\d{1,7}$/.test(amount ?? "")) return null;
  return { token, price: Number(amount), payment: payment === "waiting" ? "waiting" : "cash" };
}

export const quickPaymentLabel = (payment: QuickPayment) => (payment === "waiting" ? "Waiting for payment (bank transfer)" : "Pay in cash");

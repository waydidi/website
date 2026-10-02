// Waydidi general cancellation policy. Pure rules (no database), shared by the
// policy page, booking pages and the server-side refund calculation.
// Product-specific conditions accepted at booking take precedence when present.

export const REFUND_POLICY_VERSION = "2026-10-02";
export const REFUND_POLICY_TIMEZONE = "Asia/Bangkok";

export type RefundTier = { minHours: number; percent: number; label: string };

/** Ordered from most to least notice. Notice = scheduled service time − cancellation request time. */
export const GENERAL_REFUND_TIERS: RefundTier[] = [
  { minHours: 48, percent: 100, label: "More than 48 hours before pickup" },
  { minHours: 24, percent: 50, label: "24–48 hours before pickup" },
  { minHours: -Infinity, percent: 0, label: "Less than 24 hours before pickup" },
];

export type RefundReason = "customer_cancellation" | "no_show" | "waydidi_cancellation" | "goodwill";

/** Service start as a timestamp, read in Thailand time (the booking's service timezone). */
export function serviceStartMs(date: string, time: string) {
  const ms = Date.parse(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(ms)) throw new Error("INVALID_SERVICE_TIME");
  return ms;
}

/** Hours of notice given; never based on the payment date. */
export function noticeHours(serviceStart: number, requestedAt: number) {
  return (serviceStart - requestedAt) / 3_600_000;
}

/** Refund percentage for the reason and notice. Exactly 48 h counts as 24–48 h; exactly 24 h counts as 24–48 h. */
export function refundPercent(reason: RefundReason, hours: number, tiers: RefundTier[] = GENERAL_REFUND_TIERS) {
  if (reason === "waydidi_cancellation") return 100;
  if (reason === "no_show") return 0;
  if (reason === "goodwill") return 100;
  if (hours > 48) return tiers[0].percent;
  if (hours >= 24) return tiers[1].percent;
  return tiers[2].percent;
}

/** customer_refund_amount = eligible amount × percentage, in minor units, never above what is still refundable. */
export function customerRefundMinor(eligibleMinor: number, percent: number, alreadyRefundedMinor = 0) {
  const raw = Math.floor((Math.max(0, eligibleMinor) * Math.max(0, Math.min(100, percent))) / 100);
  return Math.max(0, Math.min(raw, eligibleMinor - Math.max(0, alreadyRefundedMinor)));
}

export function describeRefund(reason: RefundReason, hours: number) {
  const percent = refundPercent(reason, hours);
  const window = reason === "waydidi_cancellation" ? "Waydidi could not provide the service"
    : reason === "no_show" ? "No-show"
    : hours > 48 ? GENERAL_REFUND_TIERS[0].label : hours >= 24 ? GENERAL_REFUND_TIERS[1].label : GENERAL_REFUND_TIERS[2].label;
  return { percent, window };
}

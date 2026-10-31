import { GENERAL_REFUND_TIERS, type RefundTier } from "./refund-policy";

// Pure cancellation pricing. Round the combined fare once, half-up to a satang,
// before storefront/affiliate/promo/member discounts. Add-ons are unaffected.
export type CancellationOption = "standard" | "non_refundable" | "flexible";
export type CancellationConfig = { enabled: boolean; discountBps: number; surchargeBps: number; fullRefundHours: number };
function integer(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isSafeInteger(n) && n >= 0 && n <= max ? n : fallback;
}
export function cancellationConfig(env: Record<string, unknown>): CancellationConfig {
  return { enabled: env.CANCELLATION_OPTIONS === "1", discountBps: integer(env.CANCELLATION_NONREFUNDABLE_DISCOUNT_BPS, 500, 10000), surchargeBps: integer(env.CANCELLATION_FLEXIBLE_SURCHARGE_BPS, 1500, 100000), fullRefundHours: integer(env.CANCELLATION_FLEXIBLE_FULL_REFUND_HOURS, 12, 48) };
}
export function resolveCancellationOption(value: unknown, config: CancellationConfig, hours: number, payment: string): CancellationOption {
  if (!config.enabled) return "standard";
  if (value === undefined || value === "standard") return "standard";
  if (value !== "flexible" && value !== "non_refundable") throw new Error("INVALID_CANCELLATION_OPTION");
  if (value === "non_refundable") {
    if (payment !== "card") return "standard";
    if (!Number.isFinite(hours) || hours <= 48) throw new Error("INELIGIBLE_CANCELLATION_OPTION");
  }
  return value;
}
export function cancellationTiers(option: CancellationOption, config: CancellationConfig): RefundTier[] {
  if (option === "standard") return GENERAL_REFUND_TIERS;
  const hours = option === "flexible" ? config.fullRefundHours : 0;
  const percent = option === "flexible" ? 100 : 0;
  return [
    { minHours: hours, percent, label: option === "flexible" ? `Full refund at least ${hours} hours before pickup` : "Non-refundable customer cancellation" },
    { minHours: hours, percent, label: option === "flexible" ? `Full refund at least ${hours} hours before pickup` : "Non-refundable customer cancellation" },
    { minHours: -Infinity, percent: 0, label: "No refund" },
  ];
}
export function cancellationFareMinor(fareMinor: number, option: CancellationOption, config: CancellationConfig) {
  if (!Number.isSafeInteger(fareMinor) || fareMinor < 0) throw new Error("INVALID_FARE");
  const bps = !config.enabled || option === "standard" ? 10000 : option === "flexible" ? 10000 + config.surchargeBps : 10000 - config.discountBps;
  const result = (BigInt(fareMinor) * BigInt(bps) + 5000n) / 10000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("INVALID_FARE");
  return Number(result);
}

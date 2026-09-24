// Promo code rules. Pure functions: the server uses them to set the final
// price; the browser only ever shows what the server returned.

export type PromoRule = {
  code: string;
  title: string;
  discountType: string; // "percent" | "fixed"
  discountValue: number;
  maxDiscount: number | null;
  minFare: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  perCustomerLimit: number;
  firstBookingOnly: boolean;
  service: string; // "any" | "transfer" | "hourly" | "return" (transfer with a return journey)
  vehiclesJson: string | null;
  status: string;
};

export type PromoContext = {
  total: number; // THB, before discount
  serviceType: "transfer" | "hourly";
  returnTrip?: boolean;
  vehicle: string;
  now: Date;
  usesSoFar: number; // live uses of this code by everyone
  customerUses: number; // live uses by this customer
  hasPriorBooking: boolean; // confirmed or completed booking before
};

export type PromoResult = { ok: true; discount: number; finalTotal: number } | { ok: false; reason: string };

export function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "").slice(0, 32) : "";
}

export function isCodeShape(code: string) {
  return /^[A-Z0-9_-]{3,32}$/.test(code);
}

export function discountFor(rule: Pick<PromoRule, "discountType" | "discountValue" | "maxDiscount">, total: number) {
  const raw = rule.discountType === "percent" ? Math.floor((total * Math.min(100, Math.max(0, rule.discountValue))) / 100) : Math.max(0, rule.discountValue);
  const capped = rule.maxDiscount != null ? Math.min(raw, rule.maxDiscount) : raw;
  // Never discount the whole fare.
  return Math.max(0, Math.min(capped, total - 1));
}

const money = (value: number) => `THB ${value.toLocaleString("en-US")}`;

export function evaluatePromo(rule: PromoRule | null, ctx: PromoContext): PromoResult {
  if (!rule || rule.status !== "active") return { ok: false, reason: "This promo code isn't valid." };
  const now = ctx.now.getTime();
  if (rule.startsAt && now < new Date(rule.startsAt).getTime()) return { ok: false, reason: "This promo code isn't active yet." };
  if (rule.endsAt && now > new Date(rule.endsAt).getTime()) return { ok: false, reason: "This promo code has expired." };
  if (rule.service === "return") {
    if (ctx.serviceType !== "transfer" || !ctx.returnTrip) return { ok: false, reason: "This code is for transfers with a return journey." };
  } else if (rule.service !== "any" && rule.service !== ctx.serviceType) {
    return { ok: false, reason: rule.service === "hourly" ? "This code is for hourly private driver bookings." : "This code is for private transfers." };
  }
  if (rule.vehiclesJson) {
    try {
      const vehicles = JSON.parse(rule.vehiclesJson) as string[];
      if (Array.isArray(vehicles) && vehicles.length && !vehicles.includes(ctx.vehicle)) return { ok: false, reason: "This code isn't valid for the selected car." };
    } catch { /* no vehicle limit */ }
  }
  if (ctx.total < rule.minFare) return { ok: false, reason: `This code needs a minimum fare of ${money(rule.minFare)}.` };
  if (rule.maxUses != null && ctx.usesSoFar >= rule.maxUses) return { ok: false, reason: "This promo code has been fully used." };
  if (ctx.customerUses >= Math.max(1, rule.perCustomerLimit)) return { ok: false, reason: "You've already used this promo code." };
  if (rule.firstBookingOnly && ctx.hasPriorBooking) return { ok: false, reason: "This code is for your first Waydidi booking only." };
  const discount = discountFor(rule, ctx.total);
  if (discount <= 0) return { ok: false, reason: "This promo code doesn't apply to this booking." };
  return { ok: true, discount, finalTotal: ctx.total - discount };
}

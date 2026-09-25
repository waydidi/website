import type { TierId } from "./member-tier-rules";

// Mystery box prizes. Admin → Member gifts manages the live catalog (odds per
// badge, stock); these are the suggested starting prizes it can load.
export type PrizeKind = "coupon" | "child_seat" | "exchange_stop" | "airport_transfer" | "partner_ticket";
export type PrizeWeights = Partial<Record<Exclude<TierId, "bronze">, number>>;
export type Prize = {
  id: string; name: string; description: string; emoji: string; kind: PrizeKind;
  value: number; // THB off for coupons; 0 otherwise
  weights: PrizeWeights; stock: number | null; issued: number; active: boolean; validDays: number; terms: string;
};

export const BOX_TIERS = ["gold", "diamond", "platinum"] as const;

export const DEFAULT_PRIZES: Omit<Prize, "issued">[] = [
  { id: "coupon-200", name: "THB 200 off", description: "THB 200 off your next ride.", emoji: "🎟️", kind: "coupon", value: 200, weights: { gold: 60 }, stock: null, active: true, validDays: 90, terms: "One ride, fares from THB 1,000." },
  { id: "box-child-seat", name: "Free child seat", description: "One child seat free on a booking of your choice.", emoji: "🧸", kind: "child_seat", value: 0, weights: { gold: 20 }, stock: null, active: true, validDays: 90, terms: "" },
  { id: "box-exchange", name: "Free currency exchange stop", description: "One currency exchange stop free.", emoji: "💱", kind: "exchange_stop", value: 0, weights: { gold: 20 }, stock: null, active: true, validDays: 90, terms: "" },
  { id: "coupon-500", name: "THB 500 off", description: "THB 500 off your next ride.", emoji: "🎟️", kind: "coupon", value: 500, weights: { diamond: 50 }, stock: null, active: true, validDays: 90, terms: "One ride, fares from THB 1,000." },
  { id: "box-transfer", name: "Free airport transfer", description: "A one-way transfer to or from an airport, up to THB 1,500 off.", emoji: "✈️", kind: "airport_transfer", value: 0, weights: { diamond: 30, platinum: 30 }, stock: null, active: true, validDays: 90, terms: "" },
  { id: "dinner-buffet", name: "Dinner buffet for 2", description: "A dinner buffet for two at one of our partner restaurants.", emoji: "🍽️", kind: "partner_ticket", value: 0, weights: { diamond: 20, platinum: 30 }, stock: 20, active: true, validDays: 60, terms: "Subject to the restaurant's availability. Book at least 3 days ahead." },
  { id: "dinner-cruise", name: "Dinner cruise for 2", description: "A dinner cruise on the Chao Phraya River for two.", emoji: "🛳️", kind: "partner_ticket", value: 0, weights: { platinum: 40 }, stock: 10, active: true, validDays: 60, terms: "Subject to the cruise's availability. Book at least 3 days ahead." },
];

/** Prize used if the catalog has nothing left for a badge, so a box always opens. */
export const FALLBACK_PRIZE: Omit<Prize, "issued"> = DEFAULT_PRIZES[0];

/** Weighted pick among prizes open to this badge with stock left; `roll` in [0, 1). */
export function pickPrize<P extends Pick<Prize, "weights" | "stock" | "issued" | "active">>(prizes: P[], tier: Exclude<TierId, "bronze">, roll: number): P | null {
  const open = prizes.filter((p) => p.active && (p.weights[tier] ?? 0) > 0 && (p.stock == null || p.issued < p.stock));
  const total = open.reduce((n, p) => n + (p.weights[tier] ?? 0), 0);
  if (!total) return null;
  let at = roll * total;
  for (const p of open) { const w = p.weights[tier] ?? 0; if (at < w) return p; at -= w; }
  return open.at(-1) ?? null;
}

/** Chance of each prize for a badge, in percent (for the admin table). */
export function prizeOdds<P extends Pick<Prize, "id" | "weights" | "stock" | "issued" | "active">>(prizes: P[], tier: Exclude<TierId, "bronze">) {
  const open = prizes.filter((p) => p.active && (p.weights[tier] ?? 0) > 0 && (p.stock == null || p.issued < p.stock));
  const total = open.reduce((n, p) => n + (p.weights[tier] ?? 0), 0);
  return new Map(open.map((p) => [p.id, total ? Math.round(((p.weights[tier] ?? 0) / total) * 1000) / 10 : 0]));
}

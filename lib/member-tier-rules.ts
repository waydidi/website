// Member tiers (Trip.com-style badges). A member's tier comes from completed rides
// OR spend on completed rides in the last 12 months, whichever reaches higher.
// The tier discount is applied automatically to signed-in members' bookings and
// combines with promo codes: it's taken from the fare left after the promo code.

export type TierId = "bronze" | "gold" | "diamond" | "platinum";
export type Tier = { id: TierId; name: string; rides: number; spend: number; percent: number; cap: number; freeChildSeats: number; freeExchangeStop: boolean; color: string; ink: string; perks: string[] };

export const TIERS: Tier[] = [
  { id: "bronze", name: "Bronze", rides: 0, spend: 0, percent: 3, cap: 300, freeChildSeats: 0, freeExchangeStop: false, color: "linear-gradient(135deg,#E3A57A,#A8683F)", ink: "#7A4524", perks: ["3% off every booking (up to THB 300)"] },
  { id: "gold", name: "Gold", rides: 3, spend: 8000, percent: 5, cap: 500, freeChildSeats: 0, freeExchangeStop: false, color: "linear-gradient(135deg,#FFE08A,#D9A21B)", ink: "#7A5600", perks: ["5% off every booking (up to THB 500)"] },
  { id: "diamond", name: "Diamond", rides: 8, spend: 25000, percent: 7, cap: 800, freeChildSeats: 1, freeExchangeStop: false, color: "linear-gradient(135deg,#BFE6FF,#4D9FE0)", ink: "#154C7A", perks: ["7% off every booking (up to THB 800)", "1 free child seat on every booking"] },
  { id: "platinum", name: "Platinum", rides: 15, spend: 50000, percent: 10, cap: 1200, freeChildSeats: 1, freeExchangeStop: true, color: "linear-gradient(135deg,#4B4B55,#15151A)", ink: "#15151A", perks: ["10% off every booking (up to THB 1,200)", "1 free child seat on every booking", "Free currency exchange stop on every booking"] },
];

export const tierTitle = (tier: Tier) => `${tier.name} member ${tier.percent}%`;

/** Highest tier reached by rides or spend, plus what's needed for the next one. */
export function memberTier(rides: number, spend: number) {
  const index = TIERS.reduce((best, t, i) => (rides >= t.rides || spend >= t.spend ? i : best), 0);
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  return {
    tier, next, rides, spend,
    ridesToNext: next ? Math.max(0, next.rides - rides) : 0,
    spendToNext: next ? Math.max(0, next.spend - spend) : 0,
    progress: next ? Math.min(1, Math.max(rides / next.rides, spend / next.spend)) : 1,
  };
}

export function tierDiscount(tier: Tier, total: number) {
  return Math.max(0, Math.min(Math.floor((total * tier.percent) / 100), tier.cap, total - 1));
}

/** Add-ons a tier gives free on one booking (extra seats are still charged). */
export function tierFreeAddons(tier: Tier | null | undefined, childSeats: number, exchangeStop: boolean) {
  const seats = tier ? Math.min(Math.max(0, Math.floor(childSeats)), tier.freeChildSeats) : 0;
  const exchange = Boolean(tier?.freeExchangeStop && exchangeStop);
  return { childSeats: seats, exchangeStop: exchange };
}

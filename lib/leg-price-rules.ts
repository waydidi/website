// A round trip a customer pays in two parts: the price to collect for the first trip and for the second trip.
// Pure rules (no runtime imports), unit tested directly (tests/leg-prices.test.mjs). Amounts are integer satang.

export type LegPriceInput = { first: unknown; second: unknown };
export type LegPrices = { firstMinor: number; secondMinor: number };

/** A THB amount typed by staff (up to two decimals) → satang, or null. */
export function bahtToMinor(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim().replace(/,/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  const minor = Math.round(n * 100);
  return Math.abs(n * 100 - minor) < 0.000001 && Number.isSafeInteger(minor) ? minor : null;
}

/** The two prices must both be filled and add up to the booking's total, so the customer is never over- or under-charged. */
export function parseLegPrices(input: LegPriceInput, totalMinor: number): { ok: true; value: LegPrices } | { ok: false; error: string } {
  const firstMinor = bahtToMinor(input.first), secondMinor = bahtToMinor(input.second);
  if (firstMinor === null) return { ok: false, error: "Enter the first trip price." };
  if (secondMinor === null) return { ok: false, error: "Enter the second trip price." };
  if (firstMinor + secondMinor !== totalMinor) return { ok: false, error: `The two prices must add up to the booking total (THB ${(totalMinor / 100).toLocaleString("en-US")}).` };
  return { ok: true, value: { firstMinor, secondMinor } };
}

/** The roles that may split a round trip's price. */
export const mayEditLegPrices = (role: string) => role === "owner" || role === "operations" || role === "finance";

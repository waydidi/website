// "Spin the wheel": one spin per member account. Every slice is a real discount,
// used once as the built-in code "SPIN" within 30 days, on fares from THB 1,000.
// The server picks the prize; the wheel only animates to it.
export const SPIN_CODE = "SPIN";
export const SPIN_VALID_DAYS = 30;
export const SPIN_MIN_FARE = 1000;

export type SpinPrize = { id: string; label: string; short: string; kind: "amount" | "percent"; value: number; cap: number; weight: number; color: string };

export const SPIN_PRIZES: SpinPrize[] = [
  { id: "thb100", label: "THB 100 off your next ride", short: "฿100 off", kind: "amount", value: 100, cap: 100, weight: 35, color: "#FF8A05" },
  { id: "pct5", label: "5% off your next ride (up to THB 300)", short: "5% off", kind: "percent", value: 5, cap: 300, weight: 30, color: "#1E3A8A" },
  { id: "thb200", label: "THB 200 off your next ride", short: "฿200 off", kind: "amount", value: 200, cap: 200, weight: 20, color: "#00B14F" },
  { id: "pct10", label: "10% off your next ride (up to THB 500)", short: "10% off", kind: "percent", value: 10, cap: 500, weight: 10, color: "#FF1F2D" },
  { id: "thb300", label: "THB 300 off your next ride", short: "฿300 off", kind: "amount", value: 300, cap: 300, weight: 4, color: "#7C3AED" },
  { id: "pct15", label: "15% off your next ride (up to THB 1,000)", short: "15% off", kind: "percent", value: 15, cap: 1000, weight: 1, color: "#0F172A" },
];

/** Weighted pick; `roll` is a number in [0, 1). */
export function pickPrize(roll: number): SpinPrize {
  const total = SPIN_PRIZES.reduce((n, p) => n + p.weight, 0);
  let at = roll * total;
  for (const p of SPIN_PRIZES) { if (at < p.weight) return p; at -= p.weight; }
  return SPIN_PRIZES[0];
}

export function spinDiscount(prize: SpinPrize, total: number) {
  if (total < SPIN_MIN_FARE) return 0;
  const raw = prize.kind === "amount" ? prize.value : Math.floor((total * prize.value) / 100);
  return Math.max(0, Math.min(raw, prize.cap, total - 1));
}

export const spinPrize = (id: string) => SPIN_PRIZES.find((p) => p.id === id) ?? null;

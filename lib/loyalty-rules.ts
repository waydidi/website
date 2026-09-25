// Every 5th completed ride: 10% off, up to THB 500. Redeemed like a promo code
// ("LOYALTY") so it shows and is re-checked through the normal promo flow.
export const LOYALTY_CODE = "LOYALTY";
export const LOYALTY_EVERY = 5;
export const LOYALTY_PERCENT = 10;
export const LOYALTY_CAP = 500;
export const LOYALTY_TITLE = `${LOYALTY_EVERY}th ride reward: ${LOYALTY_PERCENT}% off`;

export function loyaltyDiscount(total: number) {
  return Math.max(0, Math.min(Math.floor((total * LOYALTY_PERCENT) / 100), LOYALTY_CAP, total - 1));
}

/** Pure rule: a reward is earned for rides 5, 10, 15…; each can be used once. */
export function loyaltyProgress(completed: number, used: number) {
  const earned = Math.floor((completed + 1) / LOYALTY_EVERY);
  const eligible = used < earned;
  const ridesToNext = eligible ? 0 : LOYALTY_EVERY - ((completed + 1) % LOYALTY_EVERY || LOYALTY_EVERY) + 1;
  return { completed, eligible, ridesToNext, inCycle: completed % LOYALTY_EVERY };
}

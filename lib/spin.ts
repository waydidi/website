import { and, count, eq, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, memberSpins, promoRedemptions } from "@/db/schema";
import type { MemberCoupon } from "./promo-db";
import { pickPrize, SPIN_CODE, SPIN_MIN_FARE, SPIN_VALID_DAYS, spinPrize } from "./spin-rules";
export * from "./spin-rules";

export async function spinStatus(customerId: string) {
  const [row] = await getDb().select().from(memberSpins).where(eq(memberSpins.customerId, customerId)).limit(1);
  if (!row) return { spun: false as const };
  const [used] = await getDb().select({ n: count() }).from(promoRedemptions)
    .innerJoin(bookings, eq(bookings.reference, promoRedemptions.bookingReference))
    .where(and(eq(promoRedemptions.customerId, customerId), eq(promoRedemptions.code, SPIN_CODE), notInArray(bookings.status, ["expired", "payment_failed"])));
  const prize = spinPrize(row.prizeId);
  return { spun: true as const, prize, expiresAt: row.expiresAt, used: (used?.n ?? 0) > 0, expired: row.expiresAt < new Date().toISOString() };
}

/** Spins once; a second call returns the first result. */
export async function spinOnce(customerId: string) {
  const existing = await spinStatus(customerId);
  if (existing.spun) return { ...existing, fresh: false };
  const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  const prize = pickPrize(roll);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SPIN_VALID_DAYS * 864e5).toISOString();
  await getDb().insert(memberSpins).values({ customerId, prizeId: prize.id, createdAt: now.toISOString(), expiresAt }).onConflictDoNothing();
  const saved = await spinStatus(customerId); // another tab may have won the race
  return { ...saved, fresh: saved.spun && saved.prize?.id === prize.id };
}

/** The wheel prize as a card in the member's coupon wallet (code SPIN). */
export function spinCoupon(status: Awaited<ReturnType<typeof spinStatus>> | null): MemberCoupon | null {
  if (!status?.spun || !status.prize) return null;
  const p = status.prize;
  const state = status.used ? "used" : status.expired ? "not_eligible" : "available";
  return {
    code: SPIN_CODE, title: `Wheel prize: ${p.label}`, endsAt: status.expiresAt, service: "any", minFare: SPIN_MIN_FARE,
    discountType: p.kind === "percent" ? "percent" : "fixed", discountValue: p.value, maxDiscount: p.kind === "percent" ? p.cap ?? null : null,
    offerTerms: ["Won on the Waydidi wheel", "One use"], status: state, note: state === "available" ? "Ready to use" : state === "used" ? "Already used" : "Expired",
  };
}

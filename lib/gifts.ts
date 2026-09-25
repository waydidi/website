import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, memberGifts } from "@/db/schema";
import { GIFT_VALID_DAYS, giftInfo, TIER_GIFTS, type GiftId } from "./gift-rules";
import { memberTierStatus, TIERS } from "./member-tier";
import { syncMemberBoxes } from "./boxes";
export * from "./gift-rules";

export type MemberGift = { id: string; giftId: GiftId; name: string; description: string; emoji: string; tier: string; issuedAt: string; expiresAt: string; status: "available" | "used" | "expired"; usedBookingReference: string | null };

const YEAR = 365 * 864e5;

/** Issues the gift for every badge reached (Gold and up), once per badge per 12 months. */
export async function syncMemberGifts(customerId: string) {
  const { tier } = await memberTierStatus(customerId);
  const reached = TIERS.slice(1, TIERS.findIndex((t) => t.id === tier.id) + 1);
  if (!reached.length) return;
  await syncMemberBoxes(customerId, reached.map((t) => t.id as "gold" | "diamond" | "platinum")).catch(() => undefined);
  const rows = await getDb().select({ tier: memberGifts.tier, issuedAt: memberGifts.issuedAt }).from(memberGifts).where(eq(memberGifts.customerId, customerId));
  const since = new Date(Date.now() - YEAR).toISOString();
  const now = new Date();
  for (const t of reached) {
    const giftId = TIER_GIFTS[t.id];
    if (!giftId || rows.some((r) => r.tier === t.id && r.issuedAt >= since)) continue;
    await getDb().insert(memberGifts).values({
      id: crypto.randomUUID(), customerId, giftId, tier: t.id, issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + GIFT_VALID_DAYS * 864e5).toISOString(),
    });
  }
}

export async function listMemberGifts(customerId: string, sync = true): Promise<MemberGift[]> {
  if (sync) await syncMemberGifts(customerId).catch(() => undefined);
  const rows = await getDb().select().from(memberGifts).where(eq(memberGifts.customerId, customerId));
  const refs = rows.map((r) => r.usedBookingReference).filter((r): r is string => Boolean(r));
  const found = refs.length ? await getDb().select({ ref: bookings.reference, status: bookings.status }).from(bookings).where(inArray(bookings.reference, refs)) : [];
  const dead = new Set(found.filter((b) => b.status === "expired" || b.status === "payment_failed").map((b) => b.ref));
  // A claim whose booking was never saved (checkout failed after claiming) frees itself
  // after CLAIM_HOLD_MS; until then it stays reserved so another tab can't take it.
  const existing = new Set(found.map((b) => b.ref));
  const stale = new Date(Date.now() - CLAIM_HOLD_MS).toISOString();
  for (const r of rows) if (r.usedBookingReference && !existing.has(r.usedBookingReference) && (r.usedAt ?? "") < stale) dead.add(r.usedBookingReference);
  const now = new Date().toISOString();
  return rows.map((r) => {
    const gift = giftInfo(r.giftId);
    const used = Boolean(r.usedBookingReference && !dead.has(r.usedBookingReference));
    return { id: r.id, giftId: r.giftId as GiftId, name: gift.name, description: gift.description, emoji: gift.emoji, tier: r.tier, issuedAt: r.issuedAt, expiresAt: r.expiresAt, usedBookingReference: used ? r.usedBookingReference : null,
      status: used ? "used" as const : r.expiresAt < now ? "expired" as const : "available" as const };
  }).sort((a, b) => ({ available: 0, used: 1, expired: 2 })[a.status] - ({ available: 0, used: 1, expired: 2 })[b.status] || b.issuedAt.localeCompare(a.issuedAt));
}

export async function availableGift(customerId: string, giftId: GiftId, sync = false) {
  return (await listMemberGifts(customerId, sync)).find((g) => g.giftId === giftId && g.status === "available") ?? null;
}

const CLAIM_HOLD_MS = 15 * 60 * 1000;

/**
 * Claims a gift for a booking in one database step. It only succeeds if the gift is
 * free right now (never used, or its booking expired/failed, or an old claim whose
 * booking was never saved), so two checkouts can't both use the same gift.
 */
export async function claimGift(id: string, bookingReference: string): Promise<boolean> {
  const now = new Date();
  const stale = new Date(now.getTime() - CLAIM_HOLD_MS).toISOString();
  const claimed = await getDb().update(memberGifts).set({ usedBookingReference: bookingReference, usedAt: now.toISOString() })
    .where(and(eq(memberGifts.id, id), sql`(
      ${memberGifts.usedBookingReference} IS NULL
      OR ${memberGifts.usedBookingReference} = ${bookingReference}
      OR ${memberGifts.usedBookingReference} IN (SELECT reference FROM bookings WHERE status IN ('expired', 'payment_failed'))
      OR (${memberGifts.usedBookingReference} NOT IN (SELECT reference FROM bookings) AND ${memberGifts.usedAt} < ${stale})
    )`))
    .returning({ id: memberGifts.id });
  return claimed.length > 0;
}

/** Gives back gifts claimed for a booking that is not going ahead. */
export async function releaseGifts(bookingReference: string) {
  await getDb().update(memberGifts).set({ usedBookingReference: null, usedAt: null }).where(eq(memberGifts.usedBookingReference, bookingReference));
}

export async function adminGifts() {
  const rows = await getDb().select().from(memberGifts);
  return rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

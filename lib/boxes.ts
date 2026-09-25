import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { memberBoxes, memberGifts, mysteryPrizes, partnerVoucherCodes } from "@/db/schema";
import { DEFAULT_PRIZES, FALLBACK_PRIZE, pickPrize, type Prize, type PrizeWeights } from "./reward-rules";
import type { TierId } from "./member-tier-rules";
export * from "./reward-rules";

type BoxTier = Exclude<TierId, "bronze">;
const YEAR = 365 * 864e5;

export function rowToPrize(row: typeof mysteryPrizes.$inferSelect): Prize {
  let weights: PrizeWeights = {};
  try { weights = JSON.parse(row.weightsJson) as PrizeWeights; } catch { /* none */ }
  return { id: row.id, name: row.name, description: row.description, emoji: row.emoji, kind: row.kind as Prize["kind"], value: row.value, weights, stock: row.stock, issued: row.issued, active: row.active, validDays: row.validDays, terms: row.terms };
}

export async function listPrizes() {
  return (await getDb().select().from(mysteryPrizes)).map(rowToPrize);
}

/** One box per badge reached (Gold and up), once per 12 months. */
export async function syncMemberBoxes(customerId: string, reached: BoxTier[]) {
  if (!reached.length) return;
  const rows = await getDb().select({ tier: memberBoxes.tier, issuedAt: memberBoxes.issuedAt }).from(memberBoxes).where(eq(memberBoxes.customerId, customerId));
  const since = new Date(Date.now() - YEAR).toISOString();
  for (const tier of reached) {
    if (rows.some((r) => r.tier === tier && r.issuedAt >= since)) continue;
    await getDb().insert(memberBoxes).values({ id: crypto.randomUUID(), customerId, tier, issuedAt: new Date().toISOString() });
  }
}

export async function listMemberBoxes(customerId: string) {
  const rows = await getDb().select().from(memberBoxes).where(eq(memberBoxes.customerId, customerId));
  const prizes = new Map((await listPrizes().catch(() => [])).map((p) => [p.id, p]));
  return rows.sort((a, b) => Number(Boolean(a.openedAt)) - Number(Boolean(b.openedAt)) || b.issuedAt.localeCompare(a.issuedAt)).map((b) => {
    const prize = b.prizeId ? prizes.get(b.prizeId) ?? DEFAULT_PRIZES.find((p) => p.id === b.prizeId) : null;
    return { id: b.id, tier: b.tier, issuedAt: b.issuedAt, openedAt: b.openedAt, prizeName: b.prizeName, emoji: prize?.emoji ?? "🎁", kind: prize?.kind ?? null, description: prize?.description ?? "", terms: prize?.terms ?? "", voucherCode: b.voucherCode, fulfilment: b.fulfilment, expiresAt: b.expiresAt };
  });
}
export type MemberBox = Awaited<ReturnType<typeof listMemberBoxes>>[number];

/** Opens a box: picks a prize with stock left (reserving it atomically) and delivers it. */
export async function openBox(customerId: string, boxId: string) {
  const db = getDb();
  const [box] = await db.select().from(memberBoxes).where(and(eq(memberBoxes.id, boxId), eq(memberBoxes.customerId, customerId))).limit(1);
  if (!box) return { ok: false as const, error: "Box not found." };
  if (box.openedAt) return { ok: true as const, already: true };
  const tier = box.tier as BoxTier;
  let prizes = await listPrizes().catch(() => [] as Prize[]);
  let chosen: Prize | null = null;
  for (let attempt = 0; attempt < 5 && !chosen; attempt++) {
    const pick = pickPrize(prizes, tier, crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
    if (!pick) break;
    // Reserve one from stock; if someone took the last one, drop it and pick again.
    const reserved = await db.update(mysteryPrizes).set({ issued: sql`${mysteryPrizes.issued} + 1`, updatedAt: new Date().toISOString() })
      .where(and(eq(mysteryPrizes.id, pick.id), sql`(${mysteryPrizes.stock} IS NULL OR ${mysteryPrizes.issued} < ${mysteryPrizes.stock})`)).returning({ id: mysteryPrizes.id });
    if (reserved.length) chosen = pick; else prizes = prizes.filter((p) => p.id !== pick.id);
  }
  const prize: Omit<Prize, "issued"> = chosen ?? FALLBACK_PRIZE;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + prize.validDays * 864e5).toISOString();
  // Claim the box first so a double click can't open it twice.
  const claimed = await db.update(memberBoxes).set({ openedAt: now.toISOString(), prizeId: prize.id, prizeName: prize.name, expiresAt })
    .where(and(eq(memberBoxes.id, boxId), isNull(memberBoxes.openedAt))).returning({ id: memberBoxes.id });
  if (!claimed.length) {
    if (chosen) await db.update(mysteryPrizes).set({ issued: sql`${mysteryPrizes.issued} - 1` }).where(eq(mysteryPrizes.id, chosen.id));
    return { ok: true as const, already: true };
  }
  if (prize.kind === "partner_ticket") {
    const [code] = await db.select().from(partnerVoucherCodes).where(and(eq(partnerVoucherCodes.prizeId, prize.id), isNull(partnerVoucherCodes.boxId))).limit(1);
    const taken = code ? await db.update(partnerVoucherCodes).set({ boxId }).where(and(eq(partnerVoucherCodes.id, code.id), isNull(partnerVoucherCodes.boxId))).returning({ code: partnerVoucherCodes.code }) : [];
    await db.update(memberBoxes).set({ voucherCode: taken[0]?.code ?? null, fulfilment: taken[0] ? "sent" : "to_arrange" }).where(eq(memberBoxes.id, boxId));
  } else {
    const giftId = prize.kind === "coupon" ? `coupon_${prize.value}` : prize.kind;
    const giftRowId = crypto.randomUUID();
    await db.insert(memberGifts).values({ id: giftRowId, customerId, giftId, tier: `box-${tier}`, issuedAt: now.toISOString(), expiresAt });
    await db.update(memberBoxes).set({ giftRowId }).where(eq(memberBoxes.id, boxId));
  }
  return { ok: true as const, already: false, prize: { name: prize.name, emoji: prize.emoji, description: prize.description, kind: prize.kind, terms: prize.terms } };
}

// ---- Admin ----
export async function loadDefaultPrizes() {
  const existing = new Set((await listPrizes()).map((p) => p.id));
  const now = new Date().toISOString();
  let added = 0;
  for (const p of DEFAULT_PRIZES) {
    if (existing.has(p.id)) continue;
    await getDb().insert(mysteryPrizes).values({ id: p.id, name: p.name, description: p.description, emoji: p.emoji, kind: p.kind, value: p.value, weightsJson: JSON.stringify(p.weights), stock: p.stock, issued: 0, active: p.active, validDays: p.validDays, terms: p.terms, createdAt: now, updatedAt: now });
    added += 1;
  }
  return added;
}

export async function adminBoxes() {
  return (await getDb().select().from(memberBoxes)).sort((a, b) => (b.openedAt ?? b.issuedAt).localeCompare(a.openedAt ?? a.issuedAt));
}

export async function partnerCodeCounts() {
  const rows = await getDb().select({ prizeId: partnerVoucherCodes.prizeId, boxId: partnerVoucherCodes.boxId }).from(partnerVoucherCodes);
  const counts = new Map<string, { total: number; left: number }>();
  for (const r of rows) { const c = counts.get(r.prizeId) ?? { total: 0, left: 0 }; c.total += 1; if (!r.boxId) c.left += 1; counts.set(r.prizeId, c); }
  return counts;
}

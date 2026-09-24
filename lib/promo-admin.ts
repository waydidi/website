import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { promoCodes, promoRedemptions } from "@/db/schema";
import { isCodeShape, normalizeCode } from "./promo";

export async function listPromotions() {
  const rows = await getDb().select().from(promoCodes).orderBy(desc(promoCodes.updatedAt));
  // Live uses (booking not expired/cancelled/refunded) and discount given.
  const usage = await getDb().all<{ promo_id: string; uses: number; given: number; all_uses: number }>(sql`
    select r.promo_id, sum(case when b.status not in ('expired','cancelled','refunded','payment_failed') then 1 else 0 end) as uses,
      sum(case when b.status in ('confirmed','completed') then r.discount else 0 end) as given, count(*) as all_uses
    from promo_redemptions r join bookings b on b.reference = r.booking_reference group by r.promo_id`);
  const byId = new Map(usage.map((u) => [u.promo_id, u]));
  return rows.map((row) => ({ ...row, uses: byId.get(row.id)?.uses ?? 0, discountGiven: byId.get(row.id)?.given ?? 0, attempts: byId.get(row.id)?.all_uses ?? 0 }));
}

export async function recentRedemptions(promoId: string) {
  return getDb().select().from(promoRedemptions).where(eq(promoRedemptions.promoId, promoId)).orderBy(desc(promoRedemptions.createdAt)).limit(20);
}

const optionalInt = z.union([z.number().int().min(0), z.null()]).optional();
export const promoInputSchema = z.object({
  id: z.string().max(64).optional(),
  code: z.string().max(40),
  title: z.string().trim().min(3).max(120),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().min(1).max(1_000_000),
  maxDiscount: optionalInt,
  minFare: z.number().int().min(0).max(10_000_000),
  startsAt: z.string().max(40).nullable().optional(),
  endsAt: z.string().max(40).nullable().optional(),
  maxUses: optionalInt,
  perCustomerLimit: z.number().int().min(1).max(100),
  firstBookingOnly: z.boolean(),
  service: z.enum(["any", "transfer", "hourly", "return"]),
  vehicles: z.array(z.enum(["economy_sedan", "comfort_bmw", "comfort_suv", "premium_minivan"])).max(4),
  offerTerms: z.array(z.string().trim().max(240)).max(8),
  showOnHomepage: z.boolean(),
  status: z.enum(["draft", "active", "paused"]),
}).strict().superRefine((value, ctx) => {
  if (!isCodeShape(normalizeCode(value.code))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: "Use 3–32 letters, numbers, - or _." });
  if (value.discountType === "percent" && value.discountValue > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "A percentage can't be over 100." });
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End must be after start." });
});
export type PromoInput = z.infer<typeof promoInputSchema>;

export async function savePromotion(input: PromoInput) {
  const now = new Date().toISOString();
  const values = {
    code: normalizeCode(input.code),
    title: input.title,
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxDiscount: input.discountType === "percent" ? input.maxDiscount ?? null : null,
    minFare: input.minFare,
    startsAt: input.startsAt || null,
    endsAt: input.endsAt || null,
    maxUses: input.maxUses ?? null,
    perCustomerLimit: input.perCustomerLimit,
    firstBookingOnly: input.firstBookingOnly,
    service: input.service,
    vehiclesJson: input.vehicles.length ? JSON.stringify(input.vehicles) : null,
    offerTermsJson: JSON.stringify(input.offerTerms.filter(Boolean)),
    showOnHomepage: input.showOnHomepage,
    status: input.status,
    updatedAt: now,
  };
  const [clash] = await getDb().select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, values.code)).limit(1);
  if (clash && clash.id !== input.id) return { ok: false as const, error: "Another promotion already uses this code." };
  if (input.id) {
    const updated = await getDb().update(promoCodes).set(values).where(eq(promoCodes.id, input.id)).returning({ id: promoCodes.id });
    if (!updated.length) return { ok: false as const, error: "Promotion not found." };
    return { ok: true as const, id: input.id };
  }
  const id = crypto.randomUUID();
  await getDb().insert(promoCodes).values({ id, ...values, createdAt: now });
  return { ok: true as const, id };
}

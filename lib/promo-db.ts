import { env } from "cloudflare:workers";
import { checkReferral } from "@/lib/referrals";
import type { SecurityDatabase } from "@/lib/worker-db";
import { and, count, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, memberCoupons, promoCodes, promoRedemptions } from "@/db/schema";
import { evaluatePromo, normalizeCode, type PromoResult } from "./promo";
import { LOYALTY_CODE, LOYALTY_TITLE, loyaltyDiscount, loyaltyStatus } from "./loyalty";
import { availableGift, couponValue, FREE_TRANSFER_CODE, freeTransferDiscount, listMemberGifts, REWARD_CODE, REWARD_MIN_FARE, rewardDiscount } from "./gifts";
import { COMMITTED_BOOKING_STATUSES } from "@/lib/booking-status";

// Bookings in these states no longer hold a use of their code.
// Only bookings that were never paid give the use back; cancelled or refunded bookings keep it.
const RELEASED_STATUSES = ["expired", "payment_failed"];

export async function findPromo(code: string) {
  const [row] = await getDb().select().from(promoCodes).where(eq(promoCodes.code, normalizeCode(code))).limit(1);
  return row ?? null;
}

async function liveUses(promoId: string, who?: { email: string; phone: string; customerId?: string | null }) {
  const customer = who
    ? or(
        eq(promoRedemptions.customerEmail, who.email),
        eq(promoRedemptions.customerPhone, who.phone),
        ...(who.customerId ? [eq(promoRedemptions.customerId, who.customerId)] : []),
      )
    : undefined;
  const [row] = await getDb()
    .select({ uses: count() })
    .from(promoRedemptions)
    .innerJoin(bookings, eq(bookings.reference, promoRedemptions.bookingReference))
    .where(and(eq(promoRedemptions.promoId, promoId), notInArray(bookings.status, RELEASED_STATUSES), customer));
  return row?.uses ?? 0;
}

/** The D1 error a guarded promo use raises when the code ran out of uses between the check and the save. */
export const PROMO_LIMIT_ERROR = /NOT NULL constraint failed: promo_redemptions\.promo_id/;

/** Discounts that are not rows in promo_codes and have no shared use limit (gifts are claimed separately). */
const BUILT_IN_PROMO = /^(loyalty|storefront|affiliate)$|^(gift|referral):/;

/**
 * A booking's promo use, saved in the same batch as the booking. For codes from promo_codes, the row is only written
 * while the code still has uses left overall and for this customer, counted like liveUses. Otherwise promo_id is
 * NULL, the insert fails (PROMO_LIMIT_ERROR) and the whole booking rolls back, so two checkouts at once cannot both
 * take the last use. Built-in discounts (loyalty, gifts, friend invites, store and partner prices) are saved as they are.
 */
export function promoRedemptionStatement(r: { promoId: string; code: string; bookingReference: string; customerEmail: string; customerPhone: string; customerId?: string | null;
  originalTotal: number; discount: number; finalTotal: number; createdAt: string }) {
  const db = env.DB as SecurityDatabase, limited = !BUILT_IN_PROMO.test(r.promoId);
  const released = RELEASED_STATUSES.map(() => "?").join(",");
  const live = `SELECT COUNT(*) FROM promo_redemptions r JOIN bookings b ON b.reference = r.booking_reference WHERE r.promo_id = p.id AND b.status NOT IN (${released})`;
  const guard = limited
    ? `EXISTS (SELECT 1 FROM promo_codes p WHERE p.id = ? AND (p.max_uses IS NULL OR (${live}) < p.max_uses)
        AND (${live} AND (r.customer_email = ? OR r.customer_phone = ? OR r.customer_id = ?)) < MAX(1, p.per_customer_limit))`
    : "1";
  const guardParams = limited ? [r.promoId, ...RELEASED_STATUSES, ...RELEASED_STATUSES, r.customerEmail || "-", r.customerPhone || "-", r.customerId ?? null] : [];
  // No OR IGNORE: that would also swallow the NOT NULL failure the guard relies on. ON CONFLICT covers only the unique booking_reference.
  return db.prepare(`INSERT INTO promo_redemptions (id, promo_id, code, booking_reference, customer_email, customer_phone, customer_id, original_total, discount, final_total, created_at)
    VALUES (?, CASE WHEN ${guard} THEN ? END, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(booking_reference) DO NOTHING`)
    .bind(crypto.randomUUID(), ...guardParams, r.promoId, r.code, r.bookingReference, r.customerEmail, r.customerPhone, r.customerId ?? null, r.originalTotal, r.discount, r.finalTotal, r.createdAt);
}

async function priorBooking(email: string, phone: string) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(bookings)
    .where(and(inArray(bookings.status, [...COMMITTED_BOOKING_STATUSES]), or(sql`lower(${bookings.customerEmail}) = ${email}`, sql`replace(replace(replace(replace(replace(${bookings.customerPhone}, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') = ${phone}`)));
  return (row?.n ?? 0) > 0;
}

export const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, "");

// Full server-side check. Customer details are optional when previewing a code
// before they are entered; checkout always passes them.
export async function checkPromo(input: {
  code: string;
  total: number;
  serviceType: "transfer" | "hourly";
  returnTrip?: boolean;
  vehicle: string;
  email?: string;
  phone?: string;
  customerId?: string | null;
  /** Pickup or drop-off is an airport (needed for the free airport transfer gift). */
  airportTrip?: boolean;
}): Promise<PromoResult & { promo?: Pick<NonNullable<Awaited<ReturnType<typeof findPromo>>>, "id" | "code" | "title"> }> {
  // The loyalty reward is a built-in code for signed-in members only.
  if (normalizeCode(input.code) === LOYALTY_CODE) {
    if (!input.customerId) return { ok: false, reason: "Sign in to use your ride reward." };
    const status = await loyaltyStatus(input.customerId);
    if (!status.eligible) return { ok: false, reason: "Your ride reward isn't ready yet." };
    const discount = loyaltyDiscount(input.total);
    if (discount <= 0) return { ok: false, reason: "This reward doesn't apply to this booking." };
    return { ok: true, discount, finalTotal: input.total - discount, promo: { id: "loyalty", code: LOYALTY_CODE, title: LOYALTY_TITLE } };
  }
  // Free airport transfer gift (Platinum badge): up to THB 1,500 off a one-way airport ride.
  if (normalizeCode(input.code) === FREE_TRANSFER_CODE) {
    if (!input.customerId) return { ok: false, reason: "Sign in to use your gift." };
    if (input.serviceType !== "transfer" || input.returnTrip) return { ok: false, reason: "Your free transfer gift is for a one-way transfer." };
    if (!input.airportTrip) return { ok: false, reason: "Your free transfer gift is for rides to or from an airport." };
    const gift = await availableGift(input.customerId, "airport_transfer", true);
    if (!gift) return { ok: false, reason: "You don't have a free transfer gift to use." };
    const discount = freeTransferDiscount(input.total);
    return { ok: true, discount, finalTotal: input.total - discount, promo: { id: `gift:${gift.id}`, code: FREE_TRANSFER_CODE, title: "Gift: free airport transfer" } };
  }
  // Money-off coupon won in a mystery box: the member's biggest one is used.
  if (normalizeCode(input.code) === REWARD_CODE) {
    if (!input.customerId) return { ok: false, reason: "Sign in to use your reward." };
    const coupons = (await listMemberGifts(input.customerId, false)).filter((g) => g.status === "available" && couponValue(g.giftId) > 0).sort((a, b) => couponValue(b.giftId) - couponValue(a.giftId));
    const gift = coupons[0];
    if (!gift) return { ok: false, reason: "You don't have a reward coupon to use." };
    const discount = rewardDiscount(couponValue(gift.giftId), input.total);
    if (discount <= 0) return { ok: false, reason: `Reward coupons work on fares from THB ${REWARD_MIN_FARE.toLocaleString("en-US")}.` };
    return { ok: true, discount, finalTotal: input.total - discount, promo: { id: `gift:${gift.id}`, code: REWARD_CODE, title: `Reward: ${gift.name}` } };
  }
  // A member's friend invite code (FRIEND…): ฿100 off a friend's first ride.
  const referral = await checkReferral({ code: normalizeCode(input.code), total: input.total, email: input.email, phone: input.phone, customerId: input.customerId }).catch(() => null);
  if (referral) return referral.ok ? { ok: true, discount: referral.discount, finalTotal: referral.finalTotal, promo: referral.promo } : { ok: false, reason: referral.reason };
  const promo = await findPromo(input.code);
  if (!promo) return { ok: false, reason: "This promo code isn't valid." };
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(input.phone ?? "");
  const known = Boolean(email || phone);
  const [usesSoFar, customerUses, hasPriorBooking] = await Promise.all([
    liveUses(promo.id),
    known ? liveUses(promo.id, { email: email || "-", phone: phone || "-", customerId: input.customerId }) : Promise.resolve(0),
    known && promo.firstBookingOnly ? priorBooking(email || "-", phone || "-") : Promise.resolve(false),
  ]);
  const result = evaluatePromo(promo, { total: input.total, serviceType: input.serviceType, returnTrip: input.returnTrip, vehicle: input.vehicle, now: new Date(), usesSoFar, customerUses, hasPriorBooking });
  return { ...result, promo };
}

type Who = { email: string; phone: string; customerId: string | null };

async function activePromos() {
  const now = Date.now();
  const rows = await getDb().select().from(promoCodes).where(eq(promoCodes.status, "active"));
  return rows.filter((p) => (!p.startsAt || new Date(p.startsAt).getTime() <= now) && (!p.endsAt || new Date(p.endsAt).getTime() >= now));
}

export type MemberCoupon = {
  code: string;
  title: string;
  endsAt: string | null;
  service: string;
  minFare: number;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  offerTerms: string[];
  status: "available" | "used" | "not_eligible";
  note: string;
};

// A member's coupon wallet: every live code with whether this member can still use it.
/** Codes this member collected; null if the table isn't there yet (then every public code shows). */
export async function collectedCodes(customerId: string) {
  const rows = await getDb().select({ code: memberCoupons.code }).from(memberCoupons).where(eq(memberCoupons.customerId, customerId)).catch(() => null);
  return rows ? new Set(rows.map((r) => r.code.toUpperCase())) : null;
}

/** Adds an active public code to the member's coupons. */
export async function collectCoupon(customerId: string, code: string) {
  const wanted = code.trim().toUpperCase();
  const promo = (await activePromos()).find((p) => p.code.toUpperCase() === wanted);
  if (!promo) return false;
  await getDb().insert(memberCoupons).values({ customerId, code: promo.code.toUpperCase(), collectedAt: new Date().toISOString() }).onConflictDoNothing();
  return true;
}

export async function listMemberCoupons(who: Who): Promise<MemberCoupon[]> {
  const email = who.email.trim().toLowerCase();
  const phone = normalizePhone(who.phone);
  // Members see the public codes they collected (homepage "Collect").
  const collected = who.customerId ? await collectedCodes(who.customerId) : null;
  const promos = (await activePromos()).filter((p) => !collected || collected.has(p.code.toUpperCase()));
  const hasPrior = promos.some((p) => p.firstBookingOnly) ? await priorBooking(email || "-", phone || "-") : false;
  const coupons = await Promise.all(promos.map(async (p): Promise<MemberCoupon> => {
    const [usesSoFar, mine] = await Promise.all([liveUses(p.id), liveUses(p.id, { email: email || "-", phone: phone || "-", customerId: who.customerId })]);
    let status: MemberCoupon["status"] = "available";
    let note = "Ready to use";
    if (mine >= Math.max(1, p.perCustomerLimit)) { status = "used"; note = "Already used"; }
    else if (p.maxUses != null && usesSoFar >= p.maxUses) { status = "not_eligible"; note = "Fully redeemed"; }
    else if (p.firstBookingOnly && hasPrior) { status = "not_eligible"; note = "For first bookings only"; }
    let offerTerms: string[] = [];
    try { offerTerms = JSON.parse(p.offerTermsJson ?? "[]") as string[]; } catch { /* none */ }
    return { code: p.code, title: p.title, endsAt: p.endsAt, service: p.service, minFare: p.minFare, discountType: p.discountType, discountValue: p.discountValue, maxDiscount: p.maxDiscount, offerTerms, status, note };
  }));
  const order = { available: 0, used: 1, not_eligible: 2 } as const;
  return coupons.sort((a, b) => order[a.status] - order[b.status]);
}

// The code giving the biggest discount on this exact booking, if any applies.
export async function bestCoupon(input: { total: number; serviceType: "transfer" | "hourly"; returnTrip?: boolean; vehicle: string; airportTrip?: boolean } & Who) {
  const promos = await activePromos();
  // Member rewards first, then public codes; ties keep the earlier one (same order as before).
  const codes = [
    ...(input.customerId ? [LOYALTY_CODE, FREE_TRANSFER_CODE, REWARD_CODE] : []),
    ...promos.map((p) => p.code),
  ];
  // All codes are checked at the same time instead of one after another.
  const results = await Promise.all(codes.map((code) => checkPromo({ ...input, code }).catch(() => null)));
  let best: { code: string; title: string; discount: number; finalTotal: number } | null = null;
  results.forEach((result, i) => {
    if (!result?.ok || (best && result.discount <= best.discount)) return;
    const code = codes[i];
    const title = code === LOYALTY_CODE ? LOYALTY_TITLE : result.promo?.title ?? promos.find((p) => p.code === code)?.title ?? code;
    best = { code, title, discount: result.discount, finalTotal: result.finalTotal };
  });
  return best;
}

import { and, count, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, promoCodes, promoRedemptions } from "@/db/schema";
import { evaluatePromo, normalizeCode, type PromoResult } from "./promo";
import { LOYALTY_CODE, LOYALTY_TITLE, loyaltyDiscount, loyaltyStatus } from "./loyalty";
import { SPIN_CODE, SPIN_MIN_FARE, spinDiscount, spinStatus } from "./spin";

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

async function priorBooking(email: string, phone: string) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(bookings)
    .where(and(inArray(bookings.status, ["confirmed", "completed"]), or(sql`lower(${bookings.customerEmail}) = ${email}`, sql`replace(replace(replace(replace(replace(${bookings.customerPhone}, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') = ${phone}`)));
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
  // Prize won on the wheel: once per member, within its expiry.
  if (normalizeCode(input.code) === SPIN_CODE) {
    if (!input.customerId) return { ok: false, reason: "Sign in to use your wheel prize." };
    const spin = await spinStatus(input.customerId);
    if (!spin.spun || !spin.prize) return { ok: false, reason: "Spin the wheel first to win a prize." };
    if (spin.used) return { ok: false, reason: "You've already used your wheel prize." };
    if (spin.expired) return { ok: false, reason: "Your wheel prize has expired." };
    const discount = spinDiscount(spin.prize, input.total);
    if (discount <= 0) return { ok: false, reason: `Your wheel prize works on fares from THB ${SPIN_MIN_FARE.toLocaleString("en-US")}.` };
    return { ok: true, discount, finalTotal: input.total - discount, promo: { id: `spin:${spin.prize.id}`, code: SPIN_CODE, title: `Wheel prize: ${spin.prize.label}` } };
  }
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
export async function listMemberCoupons(who: Who): Promise<MemberCoupon[]> {
  const email = who.email.trim().toLowerCase();
  const phone = normalizePhone(who.phone);
  const promos = await activePromos();
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
export async function bestCoupon(input: { total: number; serviceType: "transfer" | "hourly"; returnTrip?: boolean; vehicle: string } & Who) {
  const promos = await activePromos();
  let best: { code: string; title: string; discount: number; finalTotal: number } | null = null;
  if (input.customerId) {
    const reward = await checkPromo({ ...input, code: LOYALTY_CODE }).catch(() => null);
    if (reward?.ok) best = { code: LOYALTY_CODE, title: LOYALTY_TITLE, discount: reward.discount, finalTotal: reward.finalTotal };
    const spin = await checkPromo({ ...input, code: SPIN_CODE }).catch(() => null);
    if (spin?.ok && spin.promo && (!best || spin.discount > best.discount)) best = { code: SPIN_CODE, title: spin.promo.title, discount: spin.discount, finalTotal: spin.finalTotal };
  }
  for (const p of promos) {
    const result = await checkPromo({ code: p.code, total: input.total, serviceType: input.serviceType, returnTrip: input.returnTrip, vehicle: input.vehicle, email: input.email, phone: input.phone, customerId: input.customerId });
    if (result.ok && (!best || result.discount > best.discount)) best = { code: p.code, title: p.title, discount: result.discount, finalTotal: result.finalTotal };
  }
  return best;
}

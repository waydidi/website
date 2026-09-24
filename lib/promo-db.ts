import { and, count, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, promoCodes, promoRedemptions } from "@/db/schema";
import { evaluatePromo, normalizeCode, type PromoResult } from "./promo";

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
}): Promise<PromoResult & { promo?: Awaited<ReturnType<typeof findPromo>> }> {
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

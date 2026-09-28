import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, bookingStorefronts, storefronts } from "@/db/schema";

export type Storefront = typeof storefronts.$inferSelect;
export const STORE_SOURCE_PATTERN = /^store:[a-z0-9-]{2,40}$/;

export const storeSource = (slug: string) => `store:${slug}`;

/** URL-safe store code, e.g. "Siam Hotel" → "siam-hotel". */
export function storeSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "store";
}

export async function storefrontBySlug(slug: string, activeOnly = true) {
  const [row] = await getDb().select().from(storefronts).where(eq(storefronts.slug, slug.toLowerCase())).limit(1).catch(() => []);
  if (!row || (activeOnly && !row.active)) return null;
  return row;
}

/** The store's special price: a % off the fare (add-ons are never discounted). */
export function storeDiscount(fare: number, percent: number) {
  return Math.max(0, Math.min(fare, Math.round((fare * percent) / 100)));
}

/** Commission on the fare the customer actually pays (after the store's special price). */
export function storeCommission(fareAfterDiscount: number, percent: number) {
  return Math.max(0, Math.round((fareAfterDiscount * percent) / 100));
}

export type CommissionState = "pending" | "earned" | "cancelled";
/** Earned once the ride is completed; nothing is owed for cancelled rides. */
export function commissionState(bookingStatus: string): CommissionState {
  if (bookingStatus === "completed") return "earned";
  if (bookingStatus === "cancelled" || bookingStatus === "no_show" || bookingStatus === "binned") return "cancelled";
  return "pending";
}

export type StoreBookingRow = {
  reference: string; customerName: string; pickupDate: string; pickupTime: string; pickup: string; dropoff: string;
  status: string; total: number; discount: number; commission: number; cashAtStore: boolean; settledAt: string | null; state: CommissionState;
};

/** Every storefront booking, newest first, with its commission state. */
export async function storefrontBookings(storefrontIds?: string[]) {
  const rows = await getDb().select({
    storefrontId: bookingStorefronts.storefrontId, discount: bookingStorefronts.discount, commission: bookingStorefronts.commission,
    cashAtStore: bookingStorefronts.cashAtStore, settledAt: bookingStorefronts.settledAt,
    reference: bookings.reference, customerName: bookings.customerName, pickupDate: bookings.pickupDate, pickupTime: bookings.pickupTime,
    pickup: bookings.pickup, dropoff: bookings.dropoff, status: bookings.status, total: bookings.total,
  })
    .from(bookingStorefronts)
    .innerJoin(bookings, eq(bookings.reference, bookingStorefronts.bookingReference))
    .where(storefrontIds?.length ? inArray(bookingStorefronts.storefrontId, storefrontIds) : undefined)
    .limit(2000)
    .catch((error) => { console.error("storefrontBookings failed", error); return []; });
  return rows.map((r) => ({
    ...r,
    state: commissionState(r.status),
  })).sort((a, b) => `${b.pickupDate}${b.pickupTime}`.localeCompare(`${a.pickupDate}${a.pickupTime}`));
}

/**
 * Settlement for one store. Cash taken at the counter belongs to Waydidi minus the
 * store's commission; card payments come to Waydidi, which then owes the commission.
 * Positive = the store owes Waydidi; negative = Waydidi owes the store.
 */
export function storeBalance(rows: Pick<StoreBookingRow, "total" | "commission" | "cashAtStore" | "settledAt" | "state">[]) {
  let earned = 0, pendingCommission = 0, cashHeld = 0, balance = 0;
  for (const r of rows) {
    if (r.state === "pending") pendingCommission += r.commission;
    if (r.state !== "earned" || r.settledAt) continue;
    earned += r.commission;
    if (r.cashAtStore) { cashHeld += r.total; balance += r.total - r.commission; } else balance -= r.commission;
  }
  return { earned, pendingCommission, cashHeld, balance };
}

export async function settleStoreBookings(storefrontId: string) {
  const rows = await storefrontBookings([storefrontId]);
  const refs = rows.filter((r) => r.state === "earned" && !r.settledAt).map((r) => r.reference);
  if (refs.length) await getDb().update(bookingStorefronts).set({ settledAt: new Date().toISOString() })
    .where(and(eq(bookingStorefronts.storefrontId, storefrontId), inArray(bookingStorefronts.bookingReference, refs)));
  return refs.length;
}

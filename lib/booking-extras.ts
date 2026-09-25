import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingFreeAddons, bookingMemberDiscounts, bookingTaxInvoices, promoRedemptions } from "@/db/schema";
import { TIERS } from "@/lib/member-tier-rules";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB, FERRY_HOTEL_THB } from "@/lib/addons";

// Add-ons became paid on this date; older bookings with child seats were not charged for them.
const ADDONS_PRICED_FROM = "2026-09-24T14:30:00.000Z";

export type BookingExtras = {
  discount: { code: string; amount: number } | null;
  memberDiscount: { label: string; amount: number } | null;
  /** amount 0 = given free by the member tier (label says so). */
  addons: { label: string; amount: number }[];
  taxInvoice: { name: string; taxId: string; branch: string } | null;
};

/** Price breakdown and requests shown in the confirmation email and PDF. */
export async function bookingExtras(booking: { reference: string; childSeats: number; specialRequests: string | null; createdAt: string }): Promise<BookingExtras> {
  const [redemption] = await getDb().select({ code: promoRedemptions.code, discount: promoRedemptions.discount })
    .from(promoRedemptions).where(eq(promoRedemptions.bookingReference, booking.reference)).limit(1).catch(() => []);
  const [tax] = await getDb().select({ name: bookingTaxInvoices.name, taxId: bookingTaxInvoices.taxId, branch: bookingTaxInvoices.branch })
    .from(bookingTaxInvoices).where(eq(bookingTaxInvoices.bookingReference, booking.reference)).limit(1).catch(() => []);
  const [member] = await getDb().select().from(bookingMemberDiscounts).where(eq(bookingMemberDiscounts.bookingReference, booking.reference)).limit(1).catch(() => []);
  const [free] = await getDb().select().from(bookingFreeAddons).where(eq(bookingFreeAddons.bookingReference, booking.reference)).limit(1).catch(() => []);
  const [tierId, gift] = (free?.tier ?? "").split("+");
  const tierName = free ? [free.childSeats > 0 || free.exchangeStop ? TIERS.find((t) => t.id === tierId && (t.freeChildSeats || t.freeExchangeStop))?.name : null, gift ? "gift" : null].filter(Boolean).join(" + ") || "member reward" : "";
  const addons: BookingExtras["addons"] = [];
  if (booking.createdAt >= ADDONS_PRICED_FROM) {
    const freeSeats = Math.min(free?.childSeats ?? 0, booking.childSeats);
    if (booking.childSeats > 0) addons.push({ label: `Child seat × ${booking.childSeats}${freeSeats ? ` (${freeSeats} free, ${tierName})` : ""}`, amount: (booking.childSeats - freeSeats) * CHILD_SEAT_THB });
    const ferry = /Ferry & hotel transfer requested for (\d+)\./.exec(booking.specialRequests ?? "");
    if (ferry) addons.push({ label: `Ferry & hotel transfer × ${ferry[1]}`, amount: Number(ferry[1]) * FERRY_HOTEL_THB });
    if ((booking.specialRequests ?? "").startsWith("Currency exchange stop requested")) addons.push({ label: `Currency exchange stop${free?.exchangeStop ? ` (free, ${tierName})` : ""}`, amount: free?.exchangeStop ? 0 : EXCHANGE_STOP_THB });
  }
  return { discount: redemption ? { code: redemption.code, amount: redemption.discount } : null, memberDiscount: member ? { label: `${TIERS.find((t) => t.id === member.tier)?.name ?? "Member"} member discount (${member.percent}%)`, amount: member.discount } : null, addons, taxInvoice: tax ?? null };
}

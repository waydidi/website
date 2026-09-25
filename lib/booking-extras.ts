import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingTaxInvoices, promoRedemptions } from "@/db/schema";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB } from "@/lib/addons";

// Add-ons became paid on this date; older bookings with child seats were not charged for them.
const ADDONS_PRICED_FROM = "2026-09-24T14:30:00.000Z";

export type BookingExtras = {
  discount: { code: string; amount: number } | null;
  addons: { label: string; amount: number }[];
  taxInvoice: { name: string; taxId: string; branch: string } | null;
};

/** Price breakdown and requests shown in the confirmation email and PDF. */
export async function bookingExtras(booking: { reference: string; childSeats: number; specialRequests: string | null; createdAt: string }): Promise<BookingExtras> {
  const [redemption] = await getDb().select({ code: promoRedemptions.code, discount: promoRedemptions.discount })
    .from(promoRedemptions).where(eq(promoRedemptions.bookingReference, booking.reference)).limit(1).catch(() => []);
  const [tax] = await getDb().select({ name: bookingTaxInvoices.name, taxId: bookingTaxInvoices.taxId, branch: bookingTaxInvoices.branch })
    .from(bookingTaxInvoices).where(eq(bookingTaxInvoices.bookingReference, booking.reference)).limit(1).catch(() => []);
  const addons: BookingExtras["addons"] = [];
  if (booking.createdAt >= ADDONS_PRICED_FROM) {
    if (booking.childSeats > 0) addons.push({ label: `Child seat × ${booking.childSeats}`, amount: booking.childSeats * CHILD_SEAT_THB });
    if ((booking.specialRequests ?? "").startsWith("Currency exchange stop requested")) addons.push({ label: "Currency exchange stop", amount: EXCHANGE_STOP_THB });
  }
  return { discount: redemption ? { code: redemption.code, amount: redemption.discount } : null, addons, taxInvoice: tax ?? null };
}

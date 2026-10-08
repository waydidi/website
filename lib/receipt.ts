import { toSatang, assertSatang } from "@/lib/money";
import type { bookings, bookingPayments } from "@/db/schema";
import type { BookingExtras } from "@/lib/booking-extras";

export type ReceiptIssuer = { name: string; address: string; taxId: string; branch: string; vatRegistered: boolean; vatBasisPoints: number };
export type Receipt = {
  number: string; issuedAt: string; reference: string; kind: "receipt" | "tax_invoice";
  issuer: ReceiptIssuer; customer: { name: string; address: string; taxId: string; branch: string; email: string };
  paymentMethod: string; paymentStatus: string;
  items: { description: string; quantity: number; unitMinor: number; totalMinor: number }[];
  totalMinor: number; receivedMinor: number; refundedMinor: number; outstandingMinor: number;
  subtotalMinor: number; vatMinor: number;
};
export class ReceiptUnavailable extends Error {}
export function receiptIssuer(vars: Record<string, unknown>): ReceiptIssuer {
  const text = (key: string, fallback = "") => String(vars[key] ?? fallback).trim();
  const basis = Number(vars.WAYDIDI_RECEIPT_VAT_BPS ?? 700);
  const issuer = { name: text("WAYDIDI_RECEIPT_ISSUER_NAME", "Waydidi Travel"), address: text("WAYDIDI_RECEIPT_ISSUER_ADDRESS"), taxId: text("WAYDIDI_RECEIPT_ISSUER_TAX_ID"), branch: text("WAYDIDI_RECEIPT_ISSUER_BRANCH", "Head office"), vatRegistered: text("WAYDIDI_RECEIPT_VAT_REGISTERED") === "1", vatBasisPoints: basis };
  if (!Number.isInteger(basis) || basis < 0 || basis > 10000) throw new ReceiptUnavailable("Invalid receipt VAT configuration.");
  if (issuer.vatRegistered && (!issuer.name || !issuer.address || !/^\d{13}$/.test(issuer.taxId))) throw new ReceiptUnavailable("Tax invoice issuer details are incomplete. Ask the team to configure them.");
  return issuer;
}
export function buildReceipt(input: {
  booking: typeof bookings.$inferSelect; payment?: typeof bookingPayments.$inferSelect | null;
  extras: BookingExtras; tax?: { name: string; address: string; taxId: string; branch: string } | null;
  issuer: ReceiptIssuer; overtimeMinor?: number; overtimeReceivedMinor?: number;
}): Omit<Receipt, "number" | "issuedAt"> {
  const { booking: b, payment: p, extras, issuer } = input;
  if (b.paymentMethod === "test" || p?.provider === "test" || b.paymentStatus === "disputed" || p?.disputeStatus && p.disputeStatus !== "none") throw new ReceiptUnavailable("This payment is not eligible for a receipt.");
  if (p && p.currency.toLowerCase() !== "thb") throw new ReceiptUnavailable("Only THB receipts are supported.");
  const overtime = assertSatang(input.overtimeMinor ?? 0);
  const baseTotal = toSatang(b.total);
  const totalMinor = baseTotal + overtime;
  // A 'paid' label or confirmed cash booking alone never proves money received.
  const receivedMinor = assertSatang(p?.amountPaidMinor ?? toSatang(p?.amountPaid ?? b.amountPaid)) + assertSatang(input.overtimeReceivedMinor ?? 0);
  const refundedMinor = assertSatang(p?.refundedMinor ?? toSatang(b.refundAmount ?? 0));
  if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(receivedMinor) || receivedMinor <= 0 || receivedMinor > totalMinor || refundedMinor > receivedMinor) throw new ReceiptUnavailable("A consistent recorded payment is required before downloading a receipt.");
  const discounts = [extras.discount && { label: `Discount (${extras.discount.code})`, minor: toSatang(extras.discount.amount) }, extras.memberDiscount && { label: extras.memberDiscount.label, minor: toSatang(extras.memberDiscount.amount) }].filter((x): x is { label: string; minor: number } => Boolean(x));
  const addons = extras.addons.map(x => ({ description: x.label, quantity: 1, unitMinor: toSatang(x.amount), totalMinor: toSatang(x.amount) }));
  const serviceMinor = baseTotal + discounts.reduce((n, x) => n + x.minor, 0) - addons.reduce((n, x) => n + x.totalMinor, 0);
  if (serviceMinor < 0) throw new ReceiptUnavailable("The booking price breakdown needs review.");
  const route = `${b.pickup} to ${b.dropoff}${b.returnDate ? `; return ${b.returnPickup ?? b.dropoff} to ${b.returnDropoff ?? b.pickup} on ${b.returnDate} ${b.returnTime ?? ""}` : ""}`;
  const description = `${b.serviceType === "hourly" ? `${b.bookedHours}-hour private driver` : "Private transfer"} - ${b.vehicle}\n${route}\nPickup: ${b.pickupDate} ${b.pickupTime} (Bangkok)`;
  const items = [{ description, quantity: 1, unitMinor: serviceMinor, totalMinor: serviceMinor }, ...addons, ...discounts.map(x => ({ description: x.label, quantity: 1, unitMinor: -x.minor, totalMinor: -x.minor })), ...(overtime ? [{ description: "Hourly overtime", quantity: 1, unitMinor: overtime, totalMinor: overtime }] : [])];
  const kind = issuer.vatRegistered && input.tax?.address && /^\d{13}$/.test(input.tax.taxId) && receivedMinor === totalMinor && refundedMinor === 0 ? "tax_invoice" : "receipt";
  // VAT is split out of the already charged inclusive total, never added to it.
  const subtotalMinor = kind === "tax_invoice" ? Math.round(totalMinor * 10000 / (10000 + issuer.vatBasisPoints)) : totalMinor;
  return { reference: b.reference, kind, issuer, customer: { name: input.tax?.name ?? b.customerName, address: input.tax?.address ?? "", taxId: input.tax?.taxId ?? "", branch: input.tax?.branch ?? "", email: b.customerEmail }, paymentMethod: b.paymentMethod, paymentStatus: b.paymentStatus, items, totalMinor, receivedMinor, refundedMinor, outstandingMinor: Math.max(0, totalMinor - receivedMinor), subtotalMinor, vatMinor: totalMinor - subtotalMinor };
}
export function receiptPdfName(number: string) { return `Waydidi-Receipt-${number.replace(/[^A-Za-z0-9-]/g, "")}.pdf`; }

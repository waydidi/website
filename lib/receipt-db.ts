import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, bookingPayments, bookingTaxInvoices, hourlyOvertimeCharges, hourlyOvertimeReceipts } from "@/db/schema";
import { bookingExtras } from "@/lib/booking-extras";
import { buildReceipt, receiptIssuer, type Receipt } from "@/lib/receipt";
import { sha256 } from "@/lib/security";
import { openPii, PII_COLUMNS, sealPii } from "@/lib/pii";

export async function receiptForBooking(b: typeof bookings.$inferSelect): Promise<Receipt> {
  const db = getDb();
  const [[payment], [tax], [overtime], collections, extras] = await Promise.all([
    db.select().from(bookingPayments).where(eq(bookingPayments.id, `primary:${b.reference}`)).limit(1),
    db.select().from(bookingTaxInvoices).where(eq(bookingTaxInvoices.bookingReference, b.reference)).limit(1),
    db.select().from(hourlyOvertimeCharges).where(eq(hourlyOvertimeCharges.bookingReference, b.reference)).limit(1),
    db.select().from(hourlyOvertimeReceipts).where(eq(hourlyOvertimeReceipts.bookingReference, b.reference)),
    bookingExtras(b),
  ]);
  // The customer's tax ID: opened for the receipt (a tax invoice must print it in full), and sealed again inside
  // the stored snapshot. A missing key stops the receipt rather than issuing it without the number.
  const openTax = tax ? { ...tax, taxId: await openPii(tax.taxId, PII_COLUMNS.taxInvoiceTaxId) } : tax;
  const draft = buildReceipt({ booking: b, payment, tax: openTax, extras, issuer: receiptIssuer(env as unknown as Record<string, unknown>), overtimeMinor: overtime?.amountMinor, overtimeReceivedMinor: collections.reduce((n, x) => n + x.amountMinor, 0) });
  const id = await sha256(`receipt-v1:${b.reference}:${draft.kind}:${draft.totalMinor}:${draft.receivedMinor}:${draft.refundedMinor}`);
  const issuedAt = new Date().toISOString();
  const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10).replaceAll("-", "");
  const number = `R-${date}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const receipt: Receipt = { ...draft, number, issuedAt };
  // Workers Builds deploys code without applying D1 SQL migrations. Bootstrap only
  // this additive feature table after access and financial eligibility checks.
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS booking_receipt_documents (id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, number TEXT NOT NULL UNIQUE, issued_at TEXT NOT NULL, snapshot_json TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_receipt_documents_booking ON booking_receipt_documents(booking_reference)"),
  ]);
  await env.DB.prepare("INSERT INTO booking_receipt_documents(id,booking_reference,number,issued_at,snapshot_json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id, b.reference, number, issuedAt, JSON.stringify({ ...receipt, customer: { ...receipt.customer, taxId: await sealPii(receipt.customer.taxId, PII_COLUMNS.receiptTaxId) } })).run();
  const saved = await env.DB.prepare("SELECT snapshot_json FROM booking_receipt_documents WHERE id=? AND booking_reference=?").bind(id, b.reference).first() as { snapshot_json: string } | null;
  if (!saved) throw new Error("Receipt could not be recorded.");
  // Older snapshots hold the tax ID as written; newer ones sealed. Either way the document itself is unchanged.
  const stored = JSON.parse(saved.snapshot_json) as Receipt;
  return { ...stored, customer: { ...stored.customer, taxId: await openPii(stored.customer.taxId, PII_COLUMNS.receiptTaxId) } };
}

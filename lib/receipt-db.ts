import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, bookingPayments, bookingTaxInvoices, hourlyOvertimeCharges, hourlyOvertimeReceipts } from "@/db/schema";
import { bookingExtras } from "@/lib/booking-extras";
import { buildReceipt, receiptIssuer, type Receipt } from "@/lib/receipt";
import { sha256 } from "@/lib/security";

export async function receiptForBooking(b: typeof bookings.$inferSelect): Promise<Receipt> {
  const db = getDb();
  const [[payment], [tax], [overtime], collections, extras] = await Promise.all([
    db.select().from(bookingPayments).where(eq(bookingPayments.id, `primary:${b.reference}`)).limit(1),
    db.select().from(bookingTaxInvoices).where(eq(bookingTaxInvoices.bookingReference, b.reference)).limit(1),
    db.select().from(hourlyOvertimeCharges).where(eq(hourlyOvertimeCharges.bookingReference, b.reference)).limit(1),
    db.select().from(hourlyOvertimeReceipts).where(eq(hourlyOvertimeReceipts.bookingReference, b.reference)),
    bookingExtras(b),
  ]);
  const draft = buildReceipt({ booking: b, payment, tax, extras, issuer: receiptIssuer(env as unknown as Record<string, unknown>), overtimeMinor: overtime?.amountMinor, overtimeReceivedMinor: collections.reduce((n, x) => n + x.amountMinor, 0) });
  const id = await sha256(`receipt-v1:${b.reference}:${draft.kind}:${draft.totalMinor}:${draft.receivedMinor}:${draft.refundedMinor}`);
  const issuedAt = new Date().toISOString();
  const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10).replaceAll("-", "");
  const number = `R-${date}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const receipt: Receipt = { ...draft, number, issuedAt };
  await env.DB.prepare("INSERT INTO booking_receipt_documents(id,booking_reference,number,issued_at,snapshot_json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id, b.reference, number, issuedAt, JSON.stringify(receipt)).run();
  const saved = await env.DB.prepare("SELECT snapshot_json FROM booking_receipt_documents WHERE id=? AND booking_reference=?").bind(id, b.reference).first() as { snapshot_json: string } | null;
  if (!saved) throw new Error("Receipt could not be recorded.");
  return JSON.parse(saved.snapshot_json) as Receipt;
}

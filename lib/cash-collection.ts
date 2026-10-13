import { CHARGEABLE_SQL } from "@/lib/booking-status";
import { OFFLINE_METHODS_SQL } from "@/lib/payment-methods";
// Recording money collected outside a card provider: cash to the driver, or a bank transfer
// ("waiting for payment" bookings) that staff record or a slip the slip checker approved. One receipt id is recorded at
// most once, and the insert is refused when it would take the booking past its total.

type Stmt<S> = { bind: (...v: unknown[]) => S };

export type CashReceiptInput = { receiptId: string; reference: string; amountMinor: number; collectedBy: string; note: string; now: string };
/** An extra SQL condition the insert must also meet, e.g. that the slip being approved is still undecided. */
export type CashReceiptGuard = { sql: string; params: unknown[] };

/** Statements for one D1 batch (a transaction). The first one's `changes` says whether the receipt was recorded. */
export function cashReceiptStatements<S extends Stmt<S>>(db: { prepare: (sql: string) => S }, input: CashReceiptInput, guard?: CashReceiptGuard): S[] {
  const { receiptId, reference, amountMinor, collectedBy, note, now } = input;
  return [
    db.prepare(`INSERT OR IGNORE INTO cash_receipts(id,booking_reference,amount_minor,collected_by,note,created_at) SELECT ?,reference,?,?,?,? FROM bookings WHERE reference=? AND payment_method IN (${OFFLINE_METHODS_SQL}) AND status IN (${CHARGEABLE_SQL}) AND COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0)+? <= total*100${guard ? ` AND ${guard.sql}` : ""}`).bind(receiptId, amountMinor, collectedBy, note.slice(0, 300), now, reference, reference, amountMinor, ...(guard?.params ?? [])),
    db.prepare(`UPDATE bookings SET amount_paid=COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0)/100.0, payment_status=CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0)>=total*100 THEN 'paid' WHEN payment_method='transfer' THEN 'pending' ELSE 'cash_due' END, payment_status_updated_at=?,updated_at=? WHERE reference=? AND payment_method IN (${OFFLINE_METHODS_SQL}) AND EXISTS(SELECT 1 FROM cash_receipts WHERE id=? AND booking_reference=?)`).bind(reference, reference, now, now, reference, receiptId, reference),
    db.prepare(`UPDATE booking_payments SET amount_paid_minor=COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0),amount_paid=(SELECT amount_paid FROM bookings WHERE reference=?),status=(SELECT payment_status FROM bookings WHERE reference=?),updated_at=? WHERE booking_reference=? AND provider='cash'`).bind(reference, reference, reference, now, reference),
  ];
}

import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, hourlyOvertimeCharges } from "@/db/schema";
import { hourlyOvertime } from "@/lib/hourly-policy";

/** Supplemental cash charges never alter a settled card payment or its amount. */
export async function assessHourlyOvertime(reference: string, extraMinutes: number, adminEmail: string) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.serviceType !== "hourly" || !["confirmed", "completed"].includes(booking.status) || !booking.extraHourRate || !Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 1440) throw new Error("Enter valid overtime minutes for an active hourly booking.");
  const charge = hourlyOvertime(extraMinutes, booking.extraHourRate);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO hourly_overtime_charges(booking_reference,extra_minutes,charged_hours,hourly_rate,amount_minor,assessed_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(booking_reference) DO UPDATE SET extra_minutes=excluded.extra_minutes,charged_hours=excluded.charged_hours,hourly_rate=excluded.hourly_rate,amount_minor=excluded.amount_minor,assessed_by=excluded.assessed_by,updated_at=excluded.updated_at WHERE NOT EXISTS(SELECT 1 FROM hourly_overtime_receipts WHERE booking_reference=?)`).bind(reference, extraMinutes, charge.hours, charge.rate, charge.total * 100, adminEmail, now, reference),
    env.DB.prepare(`INSERT INTO booking_events(booking_reference,event_type,provider_event_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM hourly_overtime_charges WHERE booking_reference=? AND extra_minutes=? AND updated_at=?)`).bind(reference, "hourly_overtime_assessed", `overtime:${crypto.randomUUID()}`, now, reference, extraMinutes, now),
  ]);
  const [saved] = await getDb().select().from(hourlyOvertimeCharges).where(eq(hourlyOvertimeCharges.bookingReference, reference));
  if (saved.extraMinutes !== extraMinutes) throw new Error("Overtime already has a receipt and cannot be changed.");
  return charge;
}

export async function collectHourlyOvertime(reference: string, amountMinor: number, receiptId: string, adminEmail: string) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !/^[0-9a-f-]{36}$/i.test(receiptId)) throw new Error("Enter a valid overtime cash amount.");
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO hourly_overtime_receipts(id,booking_reference,amount_minor,collected_by,created_at) SELECT ?,booking_reference,?,?,? FROM hourly_overtime_charges WHERE booking_reference=? AND COALESCE((SELECT SUM(amount_minor) FROM hourly_overtime_receipts WHERE booking_reference=?),0)+?<=amount_minor AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND status IN ('confirmed','completed'))`).bind(receiptId, amountMinor, adminEmail, now, reference, reference, amountMinor, reference),
    env.DB.prepare(`INSERT OR IGNORE INTO booking_events(booking_reference,event_type,provider_event_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM hourly_overtime_receipts WHERE id=? AND booking_reference=?)`).bind(reference, "hourly_overtime_cash_received", `overtime-receipt:${receiptId}`, now, receiptId, reference),
  ]);
  if (!results[0].meta.changes) {
    const receipt = await env.DB.prepare("SELECT booking_reference,amount_minor FROM hourly_overtime_receipts WHERE id=?").bind(receiptId).first() as { booking_reference: string; amount_minor: number } | null;
    if (!receipt || receipt.booking_reference !== reference || receipt.amount_minor !== amountMinor) throw new Error("Receipt conflicts or exceeds overtime due.");
  }
}

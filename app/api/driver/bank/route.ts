import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings, drivers } from "@/db/schema";
import { parseBankDetails } from "@/lib/driver-bank-rules";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { postDriverBankDetails } from "@/lib/telegram/driver-bank";

// The driver's bank details ("กรอกข้อมูลบัญชี"), sent from the trip link once the Drop is done. The link's
// token is the driver's proof (as for every driver request); the account name must be the assigned driver's
// own name. The details are kept with the job and become the driver's saved account (used for payouts); a
// different account from the one saved before is flagged to the Admin group. The same details sent twice
// (a retry) are saved once and announced once.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json().catch(() => null) as { token?: string; bankCode?: string; accountNumber?: string; accountName?: string } | null;
  if (!input || typeof input !== "object") return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const assignment = await activeAssignmentForToken(String(input.token ?? ""));
  if (!assignment) return NextResponse.json({ error: "ลิงก์คนขับหมดอายุหรือถูกยกเลิก" }, { status: 404 });
  if (assignment.currentStatus !== "completed") return NextResponse.json({ error: "กรอกข้อมูลบัญชีได้หลังยืนยันส่งลูกค้าแล้ว" }, { status: 409 });
  const [booking] = await getDb().select({ paymentMethod: bookings.paymentMethod }).from(bookings).where(eq(bookings.reference, assignment.bookingReference)).limit(1);
  if (!booking || booking.paymentMethod === "cash") return NextResponse.json({ error: "งานเงินสดไม่ต้องกรอกข้อมูลบัญชี" }, { status: 409 });
  const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, assignment.driverId)).limit(1);
  if (!driver) return NextResponse.json({ error: "ไม่พบข้อมูลคนขับ" }, { status: 404 });
  const parsed = parseBankDetails(input, driver.fullName);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
  const { bankCode, accountNumber, accountName } = parsed.value;

  const now = new Date().toISOString();
  const previous = driver.bankCode && driver.bankAccountNumber && (driver.bankCode !== bankCode || driver.bankAccountNumber !== accountNumber)
    ? { bankCode: driver.bankCode, accountNumber: driver.bankAccountNumber } : null;
  const eventId = `driver-bank-details:${assignment.id}:${await sha256(`${bankCode}:${accountNumber}`)}`;
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO driver_payout_details (id, booking_reference, assignment_id, driver_id, bank_code, account_number, account_name, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(assignment_id) DO UPDATE SET bank_code = excluded.bank_code, account_number = excluded.account_number, account_name = excluded.account_name, updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), assignment.bookingReference, assignment.id, assignment.driverId, bankCode, accountNumber, accountName, now, now),
    env.DB.prepare("UPDATE drivers SET bank_code = ?, bank_account_number = ?, bank_account_name = ?, updated_at = ? WHERE id = ?").bind(bankCode, accountNumber, accountName, now, assignment.driverId),
    env.DB.prepare("INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'driver_bank_details_submitted', ?, ?)").bind(assignment.bookingReference, eventId, now),
  ]);
  // Announced once per distinct set of details: a retry finds its event already recorded.
  if (results[2]?.meta?.changes) {
    await postDriverBankDetails({ reference: assignment.bookingReference, driverName: driver.fullName, bankCode, accountNumber, accountName, previous })
      .catch((error) => console.error("Telegram driver bank details failed", error instanceof Error ? error.message : "unknown"));
  }
  return NextResponse.json({ ok: true, submittedAt: now });
}

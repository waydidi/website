import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, driverPayoutDetails } from "@/db/schema";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { sameOrigin } from "@/lib/security";
import { THAI_BANKS } from "@/lib/thai-banks";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json() as { token?: string; bankCode?: string; accountNumber?: string; accountName?: string };
  const assignment = await activeAssignmentForToken(input.token ?? "");
  if (!assignment) return NextResponse.json({ error: "Driver session unavailable." }, { status: 404 });
  if (assignment.currentStatus !== "completed" && assignment.currentStatus !== "no_show") return NextResponse.json({ error: "Bank details can be submitted after drop-off is completed." }, { status: 409 });
  const bankCode = input.bankCode?.trim().toUpperCase() ?? "";
  const accountNumber = input.accountNumber?.replace(/[^0-9]/gu, "") ?? "";
  const accountName = input.accountName?.trim() ?? "";
  if (!THAI_BANKS.some((bank) => bank.code === bankCode)) return NextResponse.json({ error: "Choose a valid Thai bank." }, { status: 400 });
  if (accountNumber.length < 8 || accountNumber.length > 16) return NextResponse.json({ error: "Enter a valid bank account number." }, { status: 400 });
  if (accountName.length < 2 || accountName.length > 120) return NextResponse.json({ error: "Enter the account name." }, { status: 400 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO driver_payout_details (id, booking_reference, assignment_id, driver_id, bank_code, account_number, account_name, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id) DO UPDATE SET bank_code = excluded.bank_code, account_number = excluded.account_number, account_name = excluded.account_name, updated_at = excluded.updated_at`).bind(id, assignment.bookingReference, assignment.id, assignment.driverId, bankCode, accountNumber, accountName, now, now),
    env.DB.prepare(`UPDATE drivers SET bank_code = ?, bank_account_number = ?, bank_account_name = ?, updated_at = ? WHERE id = ?`).bind(bankCode, accountNumber, accountName, now, assignment.driverId),
    env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'driver_bank_details_submitted', ?, ?)`).bind(assignment.bookingReference, `driver-bank-details:${assignment.id}`, now),
  ]);
  return NextResponse.json({ ok: true, submittedAt: now });
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingTaxInvoices, drivers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { openPii, PII_COLUMNS } from "@/lib/pii";
import { logSensitiveAccess } from "@/lib/sensitive-access";
import { canSeeFullPii, parseRevealRequest } from "@/lib/sensitive-access-rules";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const noStore = { "Cache-Control": "private, no-store" };

// "Show" next to a masked bank account number or tax ID: owner and finance only, and each one is logged
// (lib/sensitive-access.ts) before the value is returned. Everyone else only ever gets the masked value.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403, headers: noStore });
  const staff = await getWaydidiAdmin();
  if (!staff) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: noStore });
  if (!canSeeFullPii(staff.role)) return NextResponse.json({ error: "Only the owner and finance can see full numbers." }, { status: 403, headers: noStore });
  const target = parseRevealRequest(await request.json().catch(() => null));
  if (!target) return NextResponse.json({ error: "Unknown record." }, { status: 400, headers: noStore });
  const stored = target.kind === "driver_account"
    ? (await getDb().select({ value: drivers.bankAccountNumber }).from(drivers).where(eq(drivers.id, target.id)).limit(1))[0]?.value
    : (await getDb().select({ value: bookingTaxInvoices.taxId }).from(bookingTaxInvoices).where(eq(bookingTaxInvoices.bookingReference, target.id)).limit(1))[0]?.value;
  if (!stored) return NextResponse.json({ error: "Nothing saved." }, { status: 404, headers: noStore });
  let value: string;
  try { value = await openPii(stored, target.kind === "driver_account" ? PII_COLUMNS.driverAccount : PII_COLUMNS.taxInvoiceTaxId); }
  catch { return NextResponse.json({ error: "This number is encrypted and the key (PII_ENCRYPTION_KEY) is not available." }, { status: 503, headers: noStore }); }
  await logSensitiveAccess(staff, target.kind, target.id);
  return NextResponse.json({ value }, { headers: noStore });
}

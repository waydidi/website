import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { planPaymentChange, type PaymentChoice } from "@/lib/booking-edit";
import { cashReceiptStatements } from "@/lib/cash-collection";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };
const db = () => env.DB as unknown as Db;

// Admin → Edit booking → Payment: Paid / Pay in cash / Waiting for payment.
// Switching cash ↔ waiting only changes the method; "Paid" records the remaining balance in the
// cash-receipt ledger (owner/finance only), so receipts and reports see real money.
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { reference } = await context.params;
  const input = await request.json().catch(() => ({})) as { payment?: string };
  const target = input.payment as PaymentChoice;
  if (!["paid", "cash", "waiting"].includes(target)) return NextResponse.json({ error: "Choose Paid, Pay in cash or Waiting for payment." }, { status: 400 });
  const b = await db().prepare("SELECT reference,status,payment_method,payment_status,total,COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=bookings.reference),0) AS received_minor FROM bookings WHERE reference=?")
    .bind(reference).first<{ reference: string; status: string; payment_method: string; payment_status: string; total: number; received_minor: number }>();
  if (!b || b.status === "binned") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (b.status === "cancelled") return NextResponse.json({ error: "Cancelled bookings can't be changed." }, { status: 409 });
  const plan = planPaymentChange({ paymentMethod: b.payment_method, paymentStatus: b.payment_status, totalMinor: Math.round(b.total * 100), receivedMinor: b.received_minor }, target, admin.role);
  if (plan.kind === "error") return NextResponse.json({ error: plan.error }, { status: 409 });
  if (plan.kind === "none") return NextResponse.json({ ok: true, changed: false });
  const now = new Date().toISOString();
  if (plan.kind === "switch") {
    // Guarded on the state we planned from, so two people changing it at once can't both win.
    const done = await db().prepare("UPDATE bookings SET payment_method=?,payment_status=?,payment_status_updated_at=?,updated_at=?,booking_version=booking_version+1 WHERE reference=? AND payment_method=? AND payment_status=?")
      .bind(plan.paymentMethod, plan.paymentStatus, now, now, reference, b.payment_method, b.payment_status).run();
    if (!done.meta.changes) return NextResponse.json({ error: "The payment changed meanwhile. Reload and try again." }, { status: 409 });
  } else {
    // Same receipt id for a retry of the same change: it is recorded once.
    const receipt = cashReceiptStatements(db(), { receiptId: `edit-paid:${reference}:${b.received_minor}`, reference, amountMinor: plan.amountMinor, collectedBy: admin.email, note: "Marked paid in Edit booking", now });
    const [inserted] = await db().batch(receipt);
    if (!inserted.meta.changes) {
      const again = await db().prepare("SELECT 1 AS x FROM cash_receipts WHERE id=?").bind(`edit-paid:${reference}:${b.received_minor}`).first();
      if (!again) return NextResponse.json({ error: "The payment could not be recorded. Reload and try again." }, { status: 409 });
    }
  }
  console.info("Admin changed booking payment", { reference, to: target, admin: admin.email });
  // The driver's job says whether to collect cash: the Admin group chooses what happens with the driver.
  await import("@/lib/telegram/booking-changes").then((m) => m.notifyBookingEdited(reference, admin.displayName || admin.email, "แก้ไขการชำระเงิน")).catch(() => undefined);
  return NextResponse.json({ ok: true, changed: true });
}

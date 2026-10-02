import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, journeyCosts, bookingEvents } from "@/db/schema";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { paymentDashboard } from "@/lib/payment-dashboard";
import { reconcileBooking } from "@/lib/payment-reconciliation";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { assessHourlyOvertime, collectHourlyOvertime } from "@/lib/hourly-overtime-db";
export async function GET() { if (!await getWaydidiAdmin())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json(await paymentDashboard(), { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
    const admin = await getWaydidiAdmin();
    if (!admin)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!sameOrigin(request) || !isJsonRequest(request))
        return NextResponse.json({ error: "Request blocked" }, { status: 403 });
    const input = await request.json() as {
        extraMinutes?: number;
        action?: string;
        reference?: string;
        amountMinor?: number;
        receiptId?: string;
        note?: string;
        leg?: string;
        costMinor?: number;
        paymentStatus?: string;
    };
    const reference = String(input.reference ?? "").slice(0, 40);
    if (input.action === "assess_hourly_overtime" || input.action === "collect_hourly_overtime") {
        try {
            if (input.action === "assess_hourly_overtime") return NextResponse.json({ ok: true, charge: await assessHourlyOvertime(reference, input.extraMinutes!, admin.email) });
            await collectHourlyOvertime(reference, input.amountMinor!, input.receiptId ?? "", admin.email);
            return NextResponse.json({ ok: true });
        } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not record overtime." }, { status: 409 }); }
    }
    if (input.action === "update_leg_cost") {
        const [b] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
        if (!b || !["confirmed", "completed", "no_show"].includes(b.status) || !["outbound", "return"].includes(input.leg ?? "") || input.leg === "return" && !b.returnDate || !Number.isSafeInteger(input.costMinor) || input.costMinor! < 0 || input.costMinor! > 100000000 || !["unpaid", "scheduled", "paid"].includes(input.paymentStatus ?? ""))
            return NextResponse.json({ error: "Check the journey, cost and payout status." }, { status: 400 });
        const now = new Date().toISOString();
        const id = `${reference}:${input.leg}`;
        await getDb().batch([getDb().insert(journeyCosts).values({ id, bookingReference: reference, leg: input.leg!, costMinor: input.costMinor!, paymentStatus: input.paymentStatus!, updatedBy: admin.email, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: journeyCosts.id, set: { costMinor: input.costMinor!, paymentStatus: input.paymentStatus!, updatedBy: admin.email, updatedAt: now } }), getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: `${input.leg}_driver_cost_updated`, providerEventId: `cost:${crypto.randomUUID()}`, createdAt: now })]);
        return NextResponse.json({ ok: true });
    }
    if (input.action === "reconcile") {
        try {
            return NextResponse.json(await reconcileBooking(reference, "admin"));
        }
        catch {
            return NextResponse.json({ error: "Provider unavailable. Please retry." }, { status: 502 });
        }
    }
    if (input.action !== "collect_cash" || !Number.isSafeInteger(input.amountMinor) || (input.amountMinor ?? 0) <= 0 || !/^[0-9a-f-]{36}$/i.test(input.receiptId ?? ""))
        return NextResponse.json({ error: "Enter a valid cash amount." }, { status: 400 });
    const now = new Date().toISOString();
    const result = await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO cash_receipts(id,booking_reference,amount_minor,collected_by,note,created_at) SELECT ?,reference,?,?,?,? FROM bookings WHERE reference=? AND payment_method='cash' AND status IN ('confirmed','completed','no_show') AND COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0)+? <= total*100`).bind(input.receiptId, input.amountMinor, admin.email, String(input.note ?? "").slice(0, 300), now, reference, reference, input.amountMinor),
        env.DB.prepare(`UPDATE bookings SET amount_paid=COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0)/100.0, payment_status=CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0)>=total*100 THEN 'paid' ELSE 'cash_due' END, payment_status_updated_at=?,updated_at=? WHERE reference=? AND payment_method='cash' AND EXISTS(SELECT 1 FROM cash_receipts WHERE id=? AND booking_reference=?)`).bind(reference, reference, now, now, reference, input.receiptId, reference),
        env.DB.prepare(`UPDATE booking_payments SET amount_paid_minor=COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=?),0),amount_paid=(SELECT amount_paid FROM bookings WHERE reference=?),status=(SELECT payment_status FROM bookings WHERE reference=?),updated_at=? WHERE booking_reference=? AND provider='cash'`).bind(reference, reference, reference, now, reference),
    ]);
    if (!result[0].meta.changes) {
        const receipt = await env.DB.prepare("SELECT booking_reference,amount_minor FROM cash_receipts WHERE id=?").bind(input.receiptId).first() as {
            booking_reference: string;
            amount_minor: number;
        } | null;
        if (!receipt || receipt.booking_reference !== reference || receipt.amount_minor !== input.amountMinor)
            return NextResponse.json({ error: "Cash receipt conflicts or exceeds the outstanding balance." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
}

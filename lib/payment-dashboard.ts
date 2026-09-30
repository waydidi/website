import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, bookingPayments, bookingCosts, journeyCosts } from "@/db/schema";
export async function paymentDashboard() {
    const [rows, payments, costs, legCosts] = await Promise.all([getDb().select().from(bookings).orderBy(desc(bookings.createdAt)), getDb().select().from(bookingPayments), getDb().select().from(bookingCosts), getDb().select().from(journeyCosts)]);
    const pm = new Map(payments.map(p => [p.bookingReference, p]));
    const cm = new Map(costs.map(c => [c.bookingReference, c]));
    const result = rows.filter(b => b.status !== "binned").map(b => {
        const p = pm.get(b.reference);
        const c = cm.get(b.reference);
        const receivedMinor = Math.round(b.amountPaid * 100);
        const refundedMinor = p?.refundedMinor ?? Math.round((b.refundAmount ?? 0) * 100);
        const feeMinor = b.paymentMethod === "cash" ? 0 : p?.feeMinor ?? null;
        const journeyCostRows = legCosts.filter(cost => cost.bookingReference === b.reference);
        const expectedLegs = b.returnDate && b.returnTime ? ["outbound", "return"] : ["outbound"];
        const legCostsComplete = expectedLegs.every(leg => journeyCostRows.some(cost => cost.leg === leg));
        // Once split costs are entered, the old combined cost becomes historical.
        const costMinor = journeyCostRows.length ? legCostsComplete ? journeyCostRows.reduce((sum, cost) => sum + cost.costMinor, 0) : null : c ? c.totalDriverCost * 100 : null;
        const costPaymentStatus = journeyCostRows.length ? !legCostsComplete ? "missing" : journeyCostRows.every(cost => cost.paymentStatus === "paid") ? "paid" : "unpaid" : c?.paymentStatus ?? "missing";
        // Disputed funds are not counted as available profit; fees from subsequent
        // refund/dispute transactions aren't yet a complete settlement ledger.
        const marginMinor = costMinor == null ? null : receivedMinor - refundedMinor - costMinor;
        return { reference: b.reference, customer: b.customerName, date: b.pickupDate, method: b.paymentMethod, status: b.paymentStatus, bookingStatus: b.status, totalMinor: b.total * 100, receivedMinor, refundedMinor, cashDueMinor: b.paymentMethod === "cash" && !["cancelled", "expired"].includes(b.status) ? Math.max(0, b.total * 100 - receivedMinor) : 0, disputeStatus: p?.disputeStatus ?? (b.paymentStatus === "disputed" ? "open" : null), feeMinor, costMinor, costPaymentStatus, legCosts: expectedLegs.map(leg => ({ leg, costMinor: journeyCostRows.find(cost => cost.leg === leg)?.costMinor ?? null, paymentStatus: journeyCostRows.find(cost => cost.leg === leg)?.paymentStatus ?? "missing" })), marginMinor, profitMinor: b.paymentStatus === "disputed" || marginMinor == null || feeMinor == null ? null : marginMinor - feeMinor, lastCheckedAt: b.lastPaymentCheckedAt };
    });
    return { rows: result, summary: { receivedMinor: result.reduce((s, r) => s + r.receivedMinor, 0), refundedMinor: result.reduce((s, r) => s + r.refundedMinor, 0), cashDueMinor: result.reduce((s, r) => s + r.cashDueMinor, 0), driverCostsMinor: result.reduce((s, r) => s + (r.costMinor ?? 0), 0), disputes: result.filter(r => r.status === "disputed").length, missingCosts: result.filter(r => r.costMinor == null).length, profitMinor: result.reduce((s, r) => s + (r.profitMinor ?? 0), 0), profitIncomplete: result.some(r => r.profitMinor == null) } };
}

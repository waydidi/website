"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { paymentDashboard } from "@/lib/payment-dashboard";
type Data = Awaited<ReturnType<typeof paymentDashboard>>;
const money = (n: number | null) => n == null ? "Pending" : new Intl.NumberFormat("en-TH", { style: "currency", currency: "THB" }).format(n / 100);
export default function PaymentsWorkspace() {
    const [data, setData] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");
    const [filter, setFilter] = useState("all");
    const cashAttempt = useRef<{
        reference: string;
        amountMinor: number;
        receiptId: string;
    } | null>(null);
    const load = useCallback(async () => { try {
        const res = await fetch("/api/admin/payments", { cache: "no-store" });
        if (!res.ok)
            throw Error("Could not load payments.");
        setData(await res.json());
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
    } }, []);
    useEffect(() => {
        const first = window.setTimeout(() => { void load(); }, 0);
        const timer = window.setInterval(() => { void load(); }, 30_000);
        return () => { window.clearTimeout(first); window.clearInterval(timer); };
    }, [load]);
    async function action(reference: string, kind: string, amountMinor?: number, extra: Record<string, unknown> = {}) {
        setBusy(reference);
        setError("");
        if (kind === "collect_cash" && amountMinor != null && (!cashAttempt.current || cashAttempt.current.reference !== reference || cashAttempt.current.amountMinor !== amountMinor))
            cashAttempt.current = { reference, amountMinor, receiptId: crypto.randomUUID() };
        try {
            const res = await fetch("/api/admin/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, action: kind, amountMinor, receiptId: kind === "collect_cash" ? cashAttempt.current?.receiptId : undefined, ...extra }) });
            const json = await res.json();
            if (!res.ok)
                throw Error(json.error);
            if (kind === "collect_cash")
                cashAttempt.current = null;
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Request failed");
        }
        finally {
            setBusy("");
        }
    }
    return <section className="p-6"><h1 className="text-3xl font-black">Payments</h1><p className="my-3 text-slate-600">Received payments, cash collection, refunds, disputes and driver costs for each journey. Amounts in THB.</p>{error && <p role="alert" className="my-4 text-red-700">{error}</p>}{data && <><div className="my-6 grid gap-4 md:grid-cols-3">{[["Received", money(data.summary.receivedMinor)], ["Cash to collect", money(data.summary.cashDueMinor)], ["Refunded", money(data.summary.refundedMinor)], ["Driver costs", money(data.summary.driverCostsMinor)], ["Disputes", String(data.summary.disputes)], ["Known profit", money(data.summary.profitMinor)]].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p>{label}</p><strong className="text-2xl">{value}</strong></div>)}</div><p className="my-4 text-sm text-slate-600">{data.summary.missingCosts} bookings need driver costs. Entering costs for separate legs replaces the previous combined cost. Known profit excludes rows with missing costs, fees or disputed funds. Profit is provisional before additional refund/dispute fees and taxes.</p><select aria-label="Payment filter" value={filter} onChange={e => setFilter(e.target.value)} className="mb-4 rounded border p-2"><option value="all">All payments</option><option value="cash">Cash to collect</option><option value="refund">Refunds</option><option value="disputed">Disputes</option><option value="pending">Needs recovery</option></select><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Booking", "Payment", "Received", "Refunded", "Cash due", "Driver cost", "Profit", "Actions"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{data.rows.filter(r => filter === "all" || filter === "cash" && r.cashDueMinor > 0 || filter === "refund" && r.refundedMinor > 0 || filter === "disputed" && r.status === "disputed" || filter === "pending" && ["pending", "processing", "failed", "expired"].includes(r.status)).map(r => <tr key={r.reference} className="border-t"><td className="p-3"><Link href={`/admin/journeys/${r.reference}`}>{r.reference}</Link><p>{r.customer}</p></td><td className="p-3">{r.method} · {r.status}<p>{r.disputeStatus}</p></td><td className="p-3">{money(r.receivedMinor)}</td><td className="p-3">{money(r.refundedMinor)}</td><td className="p-3">{money(r.cashDueMinor)}</td><td className="p-3">{money(r.costMinor)}<p>{r.costPaymentStatus}</p><div>{r.legCosts.map(cost => <div key={cost.leg} className="mt-2"><button disabled={busy === r.reference} onClick={() => { const value = window.prompt(`${cost.leg} driver cost in THB`, cost.costMinor == null ? "" : String(cost.costMinor / 100)); if (value === null)
        return; const amount = Math.round(Number(value) * 100); if (!Number.isFinite(amount) || amount < 0 || value.trim() === "") {
        setError("Enter a valid driver cost.");
        return;
    } void action(r.reference, "update_leg_cost", undefined, { leg: cost.leg, costMinor: amount, paymentStatus: cost.paymentStatus === "paid" ? "paid" : "unpaid" }); }} className="underline">{cost.leg}: {money(cost.costMinor)}</button>{cost.costMinor != null && <button disabled={busy === r.reference} onClick={() => action(r.reference, "update_leg_cost", undefined, { leg: cost.leg, costMinor: cost.costMinor, paymentStatus: cost.paymentStatus === "paid" ? "unpaid" : "paid" })} className="ml-2 underline">{cost.paymentStatus === "paid" ? "Paid · undo" : "Mark driver paid"}</button>}</div>)}</div></td><td className="p-3">{money(r.profitMinor)}</td><td className="p-3">{r.method === "stripe" && <button disabled={busy === r.reference} onClick={() => action(r.reference, "reconcile")} className="rounded bg-slate-100 p-2">Reconcile</button>}{r.cashDueMinor > 0 && <button disabled={busy === r.reference} onClick={() => { const value = window.prompt("Cash received in THB", String(r.cashDueMinor / 100)); if (value === null)
        return; const amount = Math.round(Number(value) * 100); if (!Number.isFinite(amount) || amount <= 0 || amount > r.cashDueMinor) {
        setError("Enter an amount within the cash due.");
        return;
    } void action(r.reference, "collect_cash", amount); }} className="rounded bg-orange-100 p-2">Record cash</button>}</td></tr>)}</tbody></table></div></>}</section>;
}

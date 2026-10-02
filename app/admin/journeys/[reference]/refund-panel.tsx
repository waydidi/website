"use client";

import { LoaderCircle, RefreshCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Reason = "customer_cancellation" | "no_show" | "waydidi_cancellation" | "goodwill";
type Quote = { window: string; percent: number; noticeHours: number; provider: string; paidMinor: number; alreadyRefundedMinor: number; refundableMinor: number; amountMinor: number; serviceAt: string; requestedAt: string; paymentStatus: string; policyVersion: string } | { error: string };
type Refund = { id: string; status: string; providerStatus: string | null; provider: string; reason: string; refundPercent: number; customerRefundMinor: number; providerRefundFeeMinor: number; noticeHours: number; cancellationRequestedAt: string; approvedBy: string | null; createdAt: string; completedAt: string | null; failureMessage: string | null };

const REASONS: [Reason, string][] = [["customer_cancellation", "Customer cancelled"], ["no_show", "No-show"], ["waydidi_cancellation", "Waydidi couldn't provide the service"], ["goodwill", "Goodwill (full refund)"]];
const thb = (minor: number) => `฿${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
// datetime-local in Bangkok time ⇄ ISO with +07:00
const toLocal = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 16);
const fromLocal = (v: string) => `${v}:00+07:00`;

// Admin: refund calculated by the server from the policy; confirm before it is sent.
export function RefundPanel({ reference }: { reference: string }) {
  const [reason, setReason] = useState<Reason>("customer_cancellation");
  const [requestedAt, setRequestedAt] = useState(() => toLocal(new Date().toISOString()));
  const [data, setData] = useState<{ quote: Quote; refunds: Refund[] } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/refunds?reference=${encodeURIComponent(reference)}&reason=${reason}&requestedAt=${encodeURIComponent(fromLocal(requestedAt))}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [reference, reason, requestedAt]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload the quote when inputs change
  useEffect(() => { void load(); }, [load]);

  async function post(body: object) {
    setBusy(true); setMessage("");
    const res = await fetch("/api/admin/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string; duplicate?: boolean } | undefined;
    setBusy(false);
    if (!res?.ok) { setMessage(out?.error ?? "The refund couldn't be processed."); return; }
    setMessage(out?.duplicate ? "This refund was already submitted." : "Refund submitted. It shows as refunded once the payment provider confirms.");
    setKey(crypto.randomUUID()); await load();
  }
  const q = data?.quote;
  const quote = q && !("error" in q) ? q : null;

  return <section aria-labelledby="refund-h" className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 id="refund-h" className="flex items-center gap-2 text-[17px] font-black"><RefreshCcw size={18} className="text-[#D96F00]" />Refund</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-[13px] font-semibold">Reason<select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="h-10 rounded-lg border border-slate-200 px-2 text-[14px] font-normal">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="grid gap-1 text-[13px] font-semibold">Cancellation request received (Thailand time)<input type="datetime-local" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-2 text-[14px] font-normal" /></label>
    </div>
    {q && "error" in q && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{q.error}</p>}
    {quote && <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-3">
      {[["Scheduled service", quote.serviceAt], ["Notice given", `${quote.noticeHours} h`], ["Policy window", quote.window], ["Payment", `${quote.provider} · ${quote.paymentStatus}`], ["Paid", thb(quote.paidMinor)], ["Already refunded", thb(quote.alreadyRefundedMinor)], ["Refund percentage", `${quote.percent}%`], ["Customer refund", thb(quote.amountMinor)], ["Policy version", quote.policyVersion]].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className={`font-semibold ${k === "Customer refund" ? "text-[#C96100] text-[16px]" : ""}`}>{v}</dd></div>)}
    </dl>}
    {quote && <button type="button" disabled={busy || quote.amountMinor <= 0} onClick={() => {
      if (!window.confirm(`Refund ${thb(quote.amountMinor)} (${quote.percent}%) for ${reference} via ${quote.provider}? Provider fees are Waydidi's cost and are not deducted.`)) return;
      void post({ action: "create", reference, reason, requestedAt: fromLocal(requestedAt), idempotencyKey: key, confirm: true });
    }} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#FF8A05] px-5 text-[14px] font-bold text-white disabled:opacity-50">{busy && <LoaderCircle size={15} className="animate-spin" />}{quote.amountMinor > 0 ? `Refund ${thb(quote.amountMinor)}` : "No refund due"}</button>}
    {message && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}

    {!!data?.refunds.length && <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between"><h3 className="text-[14px] font-bold">Refund history</h3>
        <button type="button" onClick={() => void post({ action: "reconcile", reference })} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#C96100]"><RotateCw size={13} />Check provider status</button></div>
      <ul className="mt-2 divide-y divide-slate-100 text-[13px]">{data.refunds.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span><strong>{thb(r.customerRefundMinor)}</strong> · {r.refundPercent}% · {r.reason.replaceAll("_", " ")} · {r.provider}{r.providerRefundFeeMinor > 0 && ` · fee ${thb(r.providerRefundFeeMinor)}`}<br /><span className="text-slate-500">By {r.approvedBy} · {new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}{r.failureMessage ? ` · ${r.failureMessage}` : ""}</span></span>
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${r.status === "refunded" ? "bg-emerald-100 text-emerald-800" : r.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{r.status}{r.providerStatus && r.status !== "refunded" ? ` (${r.providerStatus})` : ""}</span>
      </li>)}</ul>
    </div>}
  </section>;
}

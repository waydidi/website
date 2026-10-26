"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAYMENT_DISCREPANCY_LABELS, type PaymentDiscrepancy } from "@/lib/payment-discrepancies";
import type { PaymentReviewRow } from "@/lib/payment-review-db";

type Data = { items: PaymentReviewRow[]; hasMore: boolean; staffId: string };
type HistoryEvent = { id: string; action: string; note: string; version: number; createdAt: string; actorName: string | null };
const money = (minor: number | null, currency = "THB") => minor === null ? "Unavailable" : new Intl.NumberFormat("en-TH", { style: "currency", currency }).format(minor / 100);
function reasons(row: PaymentReviewRow) {
  let codes: unknown = [];
  try { codes = JSON.parse(row.reasonsJson ?? "[]"); } catch { /* legacy record */ }
  const labels: string[] = Array.isArray(codes) ? codes.filter((code): code is PaymentDiscrepancy => typeof code === "string" && Object.hasOwn(PAYMENT_DISCREPANCY_LABELS, code)).map(code => PAYMENT_DISCREPANCY_LABELS[code]) : [];
  if (row.method === "stripe" && row.sessionMissing) labels.push("Checkout session is missing");
  if (row.paymentStatus === "disputed") labels.push("Payment is disputed");
  if (!labels.length) return [row.reconciliationStatus === "mismatch" ? "Provider data does not match. Check the provider for details." : `Payment: ${row.paymentStatus}; reconciliation: ${row.reconciliationStatus}`];
  return labels;
}

export function PaymentReviewWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("open");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PaymentReviewRow | null>(null);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<{ reference: string; events: HistoryEvent[]; offset: number; hasMore: boolean } | null>(null);
  const attempt = useRef<{ signature: string; requestId: string } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/payments/reviews?offset=${offset}&status=${filter}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Payment reviews could not be loaded.");
      const result = await response.json() as Data;
      if (!signal?.aborted) { setData(result); setError(""); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Payment reviews could not be loaded.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [offset, filter]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  async function act(row: PaymentReviewRow, action: "claim" | "release" | "note" | "resolve") {
    const body = { reference: row.reference, expectedVersion: row.version, action, note: action === "note" || action === "resolve" ? note : "" };
    const signature = JSON.stringify(body);
    if (attempt.current?.signature !== signature) attempt.current = { signature, requestId: crypto.randomUUID() };
    setBusy(row.reference); setError("");
    try {
      const response = await fetch("/api/admin/payments/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: attempt.current.requestId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Review could not be saved.");
      attempt.current = null; setSelected(null); setNote(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be saved. Retry the same action."); }
    finally { setBusy(""); }
  }

  async function showHistory(reference: string, offset = 0) {
    setBusy(reference); setError("");
    try {
      const response = await fetch(`/api/admin/payments/reviews?reference=${encodeURIComponent(reference)}&offset=${offset}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Review history could not be loaded.");
      const result = await response.json() as { events: HistoryEvent[]; hasMore: boolean };
      setHistory({ reference, events: result.events, offset, hasMore: result.hasMore });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review history could not be loaded."); }
    finally { setBusy(""); }
  }

  async function checkProvider(reference: string) {
    setBusy(reference); setError("");
    try {
      const response = await fetch("/api/admin/payments/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const result = await response.json() as { results?: Array<{ status: string }>; error?: string };
      if (!response.ok || result.results?.some(item => item.status === "provider_unavailable")) throw new Error(result.error ?? "Provider unavailable. Please retry.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Provider check failed."); }
    finally { setBusy(""); }
  }

  return <section aria-labelledby="payment-review-title" className="my-6 rounded-3xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="payment-review-title" className="text-xl font-black">Payment reconciliation reviews</h2><p className="mt-1 text-sm text-slate-600">Claim a review, investigate the provider discrepancy and leave a resolution history. Reviewing never marks a payment paid.</p></div>
      <button type="button" disabled={loading || !!busy} onClick={() => void load()} className="rounded-full border px-4 py-2 text-sm font-bold disabled:opacity-50">Refresh reviews</button>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <label className="mt-4 flex items-center gap-3 text-sm font-bold">Review status
      <select value={filter} onChange={event => { setFilter(event.target.value); setOffset(0); setData(null); }} className="rounded-xl border px-3 py-2"><option value="open">Open reviews</option><option value="resolved">Resolved reviews</option><option value="all">All reviews</option></select>
    </label>
    <div aria-busy={loading} aria-live="polite">
      {!data && loading && <p className="py-6">Loading payment reviews…</p>}
      {data?.items.length === 0 && <p className="py-6 text-sm text-slate-600">No payment reviews on this page.</p>}
      <ul className="mt-4 divide-y divide-slate-200">{data?.items.map(row => <li key={row.reference} className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Link href={`/admin/journeys/${encodeURIComponent(row.reference)}`} className="font-black underline">{row.reference}</Link>
            <ul className="mt-2 list-inside list-disc text-sm text-slate-700">{reasons(row).map(reason => <li key={reason}>{reason}</li>)}</ul>
            <p className="mt-2 text-sm">Booking total {money(row.expectedMinor)} · Recorded received {money(row.receivedMinor)} · Provider amount {money(row.providerMinor, row.providerCurrency?.toUpperCase() ?? "THB")} ({row.providerCurrency?.toUpperCase() ?? "currency unavailable"})</p>
            <p className="mt-1 text-xs text-slate-500">{row.ownerId ? `Reviewer: ${row.ownerName ?? "Assigned staff"}` : "Unassigned review"} · {row.reviewStatus} · Last provider check: {row.lastCheckedAt ? new Date(row.lastCheckedAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" }) : "Never"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(!row.ownerId || row.reviewStatus === "resolved" && row.ownerId === data.staffId) && <button type="button" disabled={!!busy} onClick={() => void act(row, "claim")} className="rounded-full border px-3 py-2 text-sm font-bold">{row.reviewStatus === "resolved" ? "Reopen review" : "Claim review"}</button>}
            {row.ownerId === data.staffId && <><button type="button" disabled={!!busy} onClick={() => { setSelected(row); setNote(""); }} className="rounded-full border px-3 py-2 text-sm font-bold">Add note or resolve</button><button type="button" disabled={!!busy} onClick={() => void act(row, "release")} className="rounded-full border px-3 py-2 text-sm font-bold">Release review</button></>}
            {row.method === "stripe" && <button type="button" disabled={!!busy} onClick={() => void checkProvider(row.reference)} className="rounded-full border px-3 py-2 text-sm font-bold">Check provider</button>}
            <button type="button" disabled={!!busy} onClick={() => void showHistory(row.reference)} className="rounded-full border px-3 py-2 text-sm font-bold">Review history</button>
          </div>
        </div>
      </li>)}</ul>
      {data && <nav aria-label="Payment review pages" className="mt-4 flex items-center gap-3 text-sm">
        <button type="button" disabled={offset === 0 || loading || !!busy} onClick={() => { setOffset(value => Math.max(0, value - 50)); setData(null); }} className="rounded-full border px-4 py-2 disabled:opacity-50">Previous reviews</button>
        <span>Page {offset / 50 + 1}</span>
        <button type="button" disabled={!data.hasMore || loading || !!busy} onClick={() => { setOffset(value => value + 50); setData(null); }} className="rounded-full border px-4 py-2 disabled:opacity-50">Next reviews</button>
      </nav>}
    </div>
    {selected && <form className="mt-4 rounded-2xl border border-slate-200 p-4" onSubmit={event => { event.preventDefault(); void act(selected, "note"); }}>
      <h3 className="font-bold">Review {selected.reference}</h3><label className="mt-3 block text-sm font-bold">Review note<textarea required minLength={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} className="mt-2 block w-full rounded-xl border p-3" /></label>
      <p className="mt-2 text-xs text-slate-600">Resolving requires the provider discrepancy to be cleared first. Payment and receipt records remain unchanged.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={!!busy || note.trim().length < 3} className="rounded-full border px-4 py-2 text-sm font-bold">Save note</button><button type="button" disabled={!!busy || note.trim().length < 3} onClick={() => void act(selected, "resolve")} className="rounded-full bg-plum px-4 py-2 text-sm font-bold text-white">Resolve review</button><button type="button" disabled={!!busy} onClick={() => setSelected(null)} className="rounded-full border px-4 py-2 text-sm font-bold">Cancel</button></div>
    </form>}
    {history && <section aria-label={`Review history for ${history.reference}`} className="mt-4 rounded-2xl border p-4"><div className="flex justify-between gap-3"><h3 className="font-bold">Review history · {history.reference}</h3><button type="button" onClick={() => setHistory(null)} className="text-sm underline">Close history</button></div>
      {history.events.length === 0 ? <p className="mt-3 text-sm">No review actions recorded.</p> : <ol className="mt-3 space-y-3">{history.events.map(event => <li key={event.id} className="text-sm"><strong>{event.action}</strong> · {event.actorName ?? "Staff"} · {new Date(event.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}<p className="mt-1 whitespace-pre-wrap">{event.note}</p></li>)}</ol>}
      <div className="mt-4 flex gap-3"><button type="button" disabled={history.offset === 0 || !!busy} onClick={() => void showHistory(history.reference, history.offset - 100)} className="rounded-full border px-3 py-2 text-sm disabled:opacity-50">Newer history</button><button type="button" disabled={!history.hasMore || !!busy} onClick={() => void showHistory(history.reference, history.offset + 100)} className="rounded-full border px-3 py-2 text-sm disabled:opacity-50">Older history</button></div>
    </section>}
  </section>;
}

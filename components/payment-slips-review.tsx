"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Slip = {
  id: string; reference: string; customer: string | null; status: "needs_review" | "approved" | "rejected"; createdAt: string;
  amountMinor: number | null; approvedAmountMinor: number | null; outstandingMinor: number | null; bankReference: string | null;
  extraction: { senderName: string | null; receiverName: string | null; receiverAccount: string | null; bank: string | null; transferredAt: string | null; confidence: string; tamperSigns: string[] } | null;
  reasons: { code: string; label: string }[]; decidedBy: string | null; decidedAt: string | null; note: string | null;
};

const money = (minor: number | null) => minor == null ? "—" : new Intl.NumberFormat("en-TH", { style: "currency", currency: "THB" }).format(minor / 100);
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";

/** Admin → Payments: bank-transfer slips waiting for finance, with what the slip checker read. */
export default function PaymentSlipsReview() {
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showDecided, setShowDecided] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments/slips", { cache: "no-store" });
      if (res.status === 403) { setSlips([]); return; }
      if (!res.ok) throw Error("Could not load transfer slips.");
      setSlips((await res.json() as { slips: Slip[] }).slips);
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
  }, []);
  useEffect(() => { const t = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(t); }, [load]);

  async function decide(slip: Slip, action: "approve" | "reject") {
    let body: Record<string, unknown> = { id: slip.id, action };
    if (action === "approve") {
      const suggested = slip.amountMinor ?? slip.outstandingMinor ?? 0;
      const value = window.prompt(`Amount received for ${slip.reference} in THB (balance due ${money(slip.outstandingMinor)}). Check it against the bank statement first.`, String(suggested / 100));
      if (value === null) return;
      const amountMinor = Math.round(Number(value) * 100);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !value.trim()) { setError("Enter a valid amount."); return; }
      body = { ...body, amountMinor };
    } else {
      const note = window.prompt("Reason shown to the customer", "We could not match this transfer. Please contact us.");
      if (!note?.trim()) return;
      body = { ...body, note };
    }
    setBusy(slip.id); setError("");
    try {
      const res = await fetch("/api/admin/payments/slips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw Error(data.error || "Request failed");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(""); }
  }

  if (!slips) return null;
  const waiting = slips.filter((s) => s.status === "needs_review");
  const shown = showDecided ? slips : waiting;
  return <section className="my-6 rounded-xl border p-4" aria-labelledby="slips-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="slips-title" className="text-xl font-black">Transfer slips <span className="text-slate-500">{waiting.length} to check</span></h2>
      <label className="text-sm"><input type="checkbox" checked={showDecided} onChange={(e) => setShowDecided(e.target.checked)} /> Show decided</label>
    </div>
    <p className="mt-1 text-sm text-slate-600">Customers with a pay-later booking can upload a bank transfer or PromptPay slip. Approving records it as received money on the booking (never more than the balance due). Always confirm the money arrived in the bank account.</p>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    {shown.length ? <div className="mt-4 grid gap-3">{shown.map((s) => <article key={s.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[160px_1fr_auto]">
      <a href={`/api/admin/payments/slips/${s.id}/image`} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, uncached admin image */}
        <img src={`/api/admin/payments/slips/${s.id}/image`} alt={`Slip for ${s.reference}`} className="max-h-56 w-full rounded-lg border object-contain" /></a>
      <div className="text-sm">
        <p className="font-black"><Link href={`/admin/journeys/${s.reference}`} className="underline">{s.reference}</Link> · {s.customer ?? "Customer"} · <span className={s.status === "approved" ? "text-success" : s.status === "rejected" ? "text-danger" : "text-warning"}>{s.status.replace("_", " ")}</span></p>
        <p>Slip amount <strong>{money(s.amountMinor)}</strong>{s.status === "needs_review" ? <> · balance due <strong>{money(s.outstandingMinor)}</strong></> : null}{s.approvedAmountMinor != null ? <> · approved <strong>{money(s.approvedAmountMinor)}</strong></> : null}</p>
        {s.extraction ? <p className="text-slate-600">{[s.extraction.bank, s.extraction.transferredAt, s.extraction.senderName && `from ${s.extraction.senderName}`, s.extraction.receiverName && `to ${s.extraction.receiverName}`, s.extraction.receiverAccount, s.bankReference && `ref ${s.bankReference}`, `read: ${s.extraction.confidence}`].filter(Boolean).join(" · ")}</p> : <p className="text-slate-600">Not read automatically.</p>}
        {s.extraction?.tamperSigns.length ? <p className="text-danger">Possible editing: {s.extraction.tamperSigns.join("; ")}</p> : null}
        {s.reasons.length && s.status === "needs_review" ? <ul className="mt-1 list-disc pl-5 text-warning">{s.reasons.map((r) => <li key={r.code}>{r.label}</li>)}</ul> : null}
        <p className="mt-1 text-slate-500">Uploaded {when(s.createdAt)}{s.decidedBy ? ` · ${s.status} by ${s.decidedBy} ${when(s.decidedAt)}` : ""}{s.note ? ` · “${s.note}”` : ""}</p>
      </div>
      {s.status === "needs_review" ? <div className="flex gap-2 md:flex-col">
        <button disabled={busy === s.id} onClick={() => decide(s, "approve")} className="min-h-tap rounded bg-brand px-4 font-bold text-ink">Approve</button>
        <button disabled={busy === s.id} onClick={() => decide(s, "reject")} className="min-h-tap rounded bg-slate-100 px-4">Reject</button>
      </div> : null}
    </article>)}</div> : <p className="mt-3 text-sm text-slate-500">No slips {showDecided ? "yet" : "waiting"}.</p>}
  </section>;
}

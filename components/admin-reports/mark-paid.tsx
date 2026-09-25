"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "Mark as paid" for one driver's week, with an optional transfer reference.
export function MarkPaid({ driverId, week, amount }: { driverId: string; week: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    const res = await fetch("/api/admin/reports/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId, week, paymentReference: ref }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError("Couldn't save. Try again."); return; }
    setOpen(false);
    router.refresh();
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-[#FF8A05] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#F07A00]">Mark as paid</button>;
  return <div className="flex flex-wrap items-center gap-2">
    <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transfer reference (optional)" className="h-9 w-56 rounded-lg border border-slate-300 px-3 text-[13px]" />
    <button type="button" disabled={busy} onClick={confirm} className="rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">{busy ? "Saving…" : `Confirm ${amount} paid`}</button>
    <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-semibold text-slate-500">Cancel</button>
    {error && <span className="text-[12px] font-semibold text-red-600">{error}</span>}
  </div>;
}

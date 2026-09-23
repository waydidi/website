"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function PaymentReconciliationButton({ reference, auto = false }: { reference?: string; auto?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const started = useRef(false);
  const reconcile = useCallback(async function reconcile() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/payments/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reference ? { reference } : {}) });
      const result = await response.json() as { checked?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Payment check failed.");
      setMessage(`${result.checked ?? 0} payment${result.checked === 1 ? "" : "s"} checked`);
      if (reference) window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment check failed."); }
    finally { setBusy(false); }
  }, [busy, reference]);
  useEffect(() => { if (auto && !started.current) { started.current = true; void reconcile(); } }, [auto, reconcile]);
  return <div className="flex items-center gap-2"><button type="button" onClick={reconcile} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-orange-50 disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} />{reference ? "Check Stripe" : "Reconcile payments"}</button>{message && <span className="text-xs text-slate-500">{message}</span>}</div>;
}

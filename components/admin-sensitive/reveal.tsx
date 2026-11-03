"use client";

import { useState } from "react";

/**
 * A masked bank account number or tax ID. Owner and finance get "Show", which fetches the full value
 * (logged on the server, app/api/admin/sensitive). Everyone else sees only the masked value.
 */
export function SensitiveValue({ masked, kind, id, canReveal }: { masked: string; kind: "driver_account" | "tax_invoice"; id: string; canReveal: boolean }) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reveal() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/sensitive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }), cache: "no-store" });
      const data = await r.json().catch(() => ({})) as { value?: string; error?: string };
      if (!r.ok || !data.value) { setError(data.error ?? "Couldn't show it."); return; }
      setFull(data.value);
    } catch { setError("Couldn't show it. Check your connection."); }
    finally { setBusy(false); }
  }
  if (!masked) return null;
  return <span className="inline-flex flex-wrap items-center gap-1.5">
    <span className="font-mono tabular-nums">{full ?? masked}</span>
    {canReveal && !full && masked !== "unreadable" && <button type="button" onClick={() => void reveal()} disabled={busy} className="rounded-full border border-slate-300 px-2 py-0.5 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? "…" : "Show"}</button>}
    {error && <span role="alert" className="text-[12px] font-semibold text-red-700">{error}</span>}
  </span>;
}

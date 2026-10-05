"use client";

import { useState } from "react";

export function ChatPayButton({ id, live, test, expiresAt }: { id: string; live: boolean; test: boolean; expiresAt: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  async function go(action: "pay" | "test_pay") {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/chat-pay/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const out = await res.json().catch(() => ({})) as { error?: string; url?: string; reference?: string };
      if (!res.ok) throw new Error(out.error ?? "Payment couldn't be started.");
      if (out.url) { window.location.href = out.url; return; }
      if (out.reference) setDone(out.reference);
    } catch (e) { setError(e instanceof Error ? e.message : "Payment couldn't be started."); }
    finally { setBusy(false); }
  }
  if (done) return <p className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800">Paid. Your booking {done} is confirmed. You&apos;ll see the confirmation in the chat too.</p>;
  return <div className="grid gap-2">
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[14px] text-red-700">{error}</p>}
    {live && <button type="button" disabled={busy} onClick={() => void go("pay")} className="h-12 rounded-full bg-[#FF8A05] text-[16px] font-bold text-white disabled:opacity-60">{busy ? "Opening…" : "Pay now"}</button>}
    {test && <button type="button" disabled={busy} onClick={() => void go("test_pay")} className="h-12 rounded-full border-2 border-dashed border-violet-400 bg-violet-50 text-[15px] font-bold text-violet-800 disabled:opacity-60">{busy ? "Paying…" : "Test payment (no money charged)"}</button>}
    {!live && !test && <p className="rounded-xl bg-amber-50 p-3 text-[14px] text-amber-900">Online payment is being set up. Please reply in the chat and our team will help you book.</p>}
    <p className="text-center text-[12.5px] text-slate-500">Link valid until {new Date(expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} (Bangkok time).</p>
  </div>;
}

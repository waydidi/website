"use client";

import Link from "next/link";
import { CheckCircle2, CreditCard, LoaderCircle, MessageSquare } from "lucide-react";
import { useState } from "react";

const input = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] outline-none focus:border-[#FF8A05]";

/** Accept and pay, or ask for changes, on the customer's itinerary page. */
export function ItineraryActions({ token, total, name, email, phone }: { token: string; total: number; name: string; email: string; phone: string }) {
  const [mode, setMode] = useState<"idle" | "accept" | "change" | "sent">("idle");
  const [f, setF] = useState({ name, email, phone, agree: false, message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function post(body: Record<string, unknown>) {
    setBusy(true); setError("");
    const res = await fetch(`/api/itinerary/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string; checkoutUrl?: string };
    setBusy(false);
    if (!res?.ok) { setError(data.error ?? "Something went wrong. Please try again."); return null; }
    return data;
  }
  if (mode === "sent") return <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900"><p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} />Thanks, we got your message.</p><p className="mt-1 text-[15px]">We&apos;ll update your itinerary and send you a new version soon.</p></div>;
  return <div className="grid gap-3">
    {mode === "idle" && <>
      <button type="button" onClick={() => setMode("accept")} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-[17px] font-bold text-white hover:bg-[#E67900]"><CreditCard size={19} />Accept and pay THB {total.toLocaleString("en-US")}</button>
      <button type="button" onClick={() => setMode("change")} className="flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white font-semibold text-[#211726] hover:border-[#FF8A05]"><MessageSquare size={17} />Ask for a change</button>
    </>}
    {mode === "accept" && <form onSubmit={async (e) => { e.preventDefault(); const r = await post({ action: "accept", name: f.name, email: f.email, phone: f.phone, agree: f.agree }); if (r?.checkoutUrl) window.location.href = r.checkoutUrl; }} className="grid gap-3">
      <p className="font-bold">Your details</p>
      <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" autoComplete="name" className={input} aria-label="Full name" />
      <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" autoComplete="email" className={input} aria-label="Email" />
      <input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone (WhatsApp or LINE)" autoComplete="tel" className={input} aria-label="Phone" />
      <label className="flex items-start gap-2 text-[14px] text-slate-700"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} className="mt-1 size-4 accent-[#FF8A05]" /><span>I accept the <Link href="/terms" target="_blank" className="underline">terms</Link> and the <Link href="/refund-policy" target="_blank" className="underline">cancellation policy</Link>.</span></label>
      <button type="submit" disabled={busy} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-[17px] font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <CreditCard size={19} />}Pay THB {total.toLocaleString("en-US")} securely</button>
      <button type="button" onClick={() => setMode("idle")} className="text-[14px] font-semibold text-slate-500">Back</button>
    </form>}
    {mode === "change" && <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "change", message: f.message })) setMode("sent"); }} className="grid gap-3">
      <p className="font-bold">What would you like to change?</p>
      <textarea required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="e.g. Can we start at 9:00 and add a beach stop?" className="min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] outline-none focus:border-[#FF8A05]" aria-label="Your request" />
      <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#211726] font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={17} className="animate-spin" />}Send request</button>
      <button type="button" onClick={() => setMode("idle")} className="text-[14px] font-semibold text-slate-500">Back</button>
    </form>}
    {error && <p role="alert" className="text-[14px] font-semibold text-red-600">{error}</p>}
  </div>;
}

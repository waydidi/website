"use client";

import Link from "next/link";
import { CheckCircle2, CreditCard, LoaderCircle, MessageSquare } from "lucide-react";
import { useState } from "react";
import { fill, tripWords, type TripWords } from "@/lib/trip-i18n";

const input = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] outline-none focus:border-[#FF8A05]";

/** Accept and pay, or ask for changes, on the customer's itinerary page. */
export function ItineraryActions({ token, total, name, email, phone, words }: { token: string; total: number; name: string; email: string; phone: string; words?: TripWords }) {
  const w = words ?? tripWords("en");
  const amount = `THB ${total.toLocaleString("en-US")}`;
  const [mode, setMode] = useState<"idle" | "accept" | "change" | "sent">("idle");
  const [f, setF] = useState({ name, email, phone, agree: false, message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function post(body: Record<string, unknown>) {
    setBusy(true); setError("");
    const res = await fetch(`/api/itinerary/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string; checkoutUrl?: string };
    setBusy(false);
    if (!res?.ok) { setError(data.error ?? w.genericError); return null; }
    return data;
  }
  if (mode === "sent") return <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900"><p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} />{w.gotMessage}</p><p className="mt-1 text-[15px]">{w.gotMessageText}</p></div>;
  return <div className="grid gap-3">
    {mode === "idle" && <>
      <button type="button" onClick={() => setMode("accept")} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-[17px] font-bold text-white hover:bg-[#E67900]"><CreditCard size={19} />{fill(w.acceptPay, { amount })}</button>
      <button type="button" onClick={() => setMode("change")} className="flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white font-semibold text-[#211726] hover:border-[#FF8A05]"><MessageSquare size={17} />{w.askChange}</button>
    </>}
    {mode === "accept" && <form onSubmit={async (e) => { e.preventDefault(); const r = await post({ action: "accept", name: f.name, email: f.email, phone: f.phone, agree: f.agree }); if (r?.checkoutUrl) window.location.href = r.checkoutUrl; }} className="grid gap-3">
      <p className="font-bold">{w.yourDetails}</p>
      <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={w.fullName} autoComplete="name" className={input} aria-label={w.fullName} />
      <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={w.email} autoComplete="email" className={input} aria-label={w.email} />
      <input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={w.phone} autoComplete="tel" className={input} aria-label={w.phone} />
      <label className="flex items-start gap-2 text-[14px] text-slate-700"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} className="mt-1 size-4 accent-[#FF8A05]" /><span>{w.acceptTerms.split(/(\{terms\}|\{policy\})/).map((part, i) => part === "{terms}" ? <Link key={i} href="/terms" target="_blank" className="underline">{w.terms}</Link> : part === "{policy}" ? <Link key={i} href="/refund-policy" target="_blank" className="underline">{w.policy}</Link> : part)}</span></label>
      <button type="submit" disabled={busy} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-[17px] font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <CreditCard size={19} />}{fill(w.paySecure, { amount })}</button>
      <button type="button" onClick={() => setMode("idle")} className="text-[14px] font-semibold text-slate-500">{w.back}</button>
    </form>}
    {mode === "change" && <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "change", message: f.message })) setMode("sent"); }} className="grid gap-3">
      <p className="font-bold">{w.changeQ}</p>
      <textarea required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder={w.changePlaceholder} className="min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] outline-none focus:border-[#FF8A05]" aria-label="Your request" />
      <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#211726] font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={17} className="animate-spin" />}{w.sendRequest}</button>
      <button type="button" onClick={() => setMode("idle")} className="text-[14px] font-semibold text-slate-500">{w.back}</button>
    </form>}
    {error && <p role="alert" className="text-[14px] font-semibold text-red-600">{error}</p>}
  </div>;
}

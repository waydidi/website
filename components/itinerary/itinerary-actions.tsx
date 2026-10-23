"use client";

import Link from "next/link";
import { CheckCircle2, CreditCard, Info, LoaderCircle, MessageSquare } from "lucide-react";
import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { fill, tripWords, type TripWords } from "@/lib/trip-i18n";

const input = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] outline-none focus:border-brand";

/**
 * Accept and pay, or ask for changes, on the customer's itinerary page. A bar fixed to the bottom of the screen (like
 * Klook's) shows the price with "Ask for a change" and "Book now" from anywhere on the page; each opens its form here.
 */
export function ItineraryActions({ token, total, name, email, phone, words }: { token: string; total: number; name: string; email: string; phone: string; words?: TripWords }) {
  const w = words ?? tripWords("en");
  const amount = `THB ${total.toLocaleString("en-US")}`;
  const [mode, setMode] = useState<"idle" | "accept" | "change" | "sent">("idle");
  const [f, setF] = useState({ name, email, phone, agree: false, message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const open = (next: "accept" | "change") => { setMode(next); setError(""); window.requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: "smooth", block: "center" })); };
  async function post(body: Record<string, unknown>) {
    setBusy(true); setError("");
    const res = await fetch(`/api/itinerary/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string; checkoutUrl?: string };
    setBusy(false);
    if (!res?.ok) { setError(data.error ?? w.genericError); return null; }
    return data;
  }
  if (mode === "sent") return <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900"><p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} />{w.gotMessage}</p><p className="mt-1 text-[15px]">{w.gotMessageText}</p></div>;
  return <div ref={box} className="grid scroll-mt-[131px] gap-3">
    {mode === "idle" && <>
      <button type="button" onClick={() => open("accept")} className="flex h-14 items-center justify-center gap-2 rounded-full bg-brand text-[17px] font-bold text-white hover:bg-brand-strong"><CreditCard size={19} />{fill(w.acceptPay, { amount })}</button>
      <button type="button" onClick={() => open("change")} className="flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white font-semibold text-plum hover:border-brand"><MessageSquare size={17} />{w.askChange}</button>
    </>}
    {mode === "accept" && <form onSubmit={async (e) => { e.preventDefault(); const r = await post({ action: "accept", name: f.name, email: f.email, phone: f.phone, agree: f.agree }); if (r?.checkoutUrl) window.location.href = r.checkoutUrl; }} className="grid gap-3">
      <p className="font-bold">{w.yourDetails}</p>
      <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={w.fullName} autoComplete="name" className={input} aria-label={w.fullName} />
      <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={w.email} autoComplete="email" className={input} aria-label={w.email} />
      <input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={w.phone} autoComplete="tel" className={input} aria-label={w.phone} />
      <label className="flex items-start gap-2 text-[14px] text-slate-700"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} className="mt-1 size-4 accent-brand" /><span>{w.acceptTerms.split(/(\{terms\}|\{policy\})/).map((part, i) => part === "{terms}" ? <Link key={i} href="/terms" target="_blank" className="underline">{w.terms}</Link> : part === "{policy}" ? <Link key={i} href="/refund-policy" target="_blank" className="underline">{w.policy}</Link> : part)}</span></label>
      <button type="submit" disabled={busy} className="flex h-14 items-center justify-center gap-2 rounded-full bg-brand text-[17px] font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <CreditCard size={19} />}{fill(w.paySecure, { amount })}</button>
      <button type="button" onClick={() => setMode("idle")} className="text-[14px] font-semibold text-slate-500">{w.back}</button>
    </form>}
    {mode === "change" && <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "change", message: f.message })) setMode("sent"); }} className="grid gap-3">
      <p className="font-bold">{w.changeQ}</p>
      <textarea required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder={w.changePlaceholder} className="min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] outline-none focus:border-brand" aria-label="Your request" />
      <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-plum font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={17} className="animate-spin" />}{w.sendRequest}</button>
      <button type="button" onClick={() => setMode("idle")} className="text-[14px] font-semibold text-slate-500">{w.back}</button>
    </form>}
    {error && <p role="alert" className="text-[14px] font-semibold text-red-600">{error}</p>}
    {mode === "idle" && <div data-testid="booking-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(0,0,0,.07)]">
      <div className="mx-auto max-w-[880px]">
        <p className="flex items-center justify-between gap-3">
          <Sheet>
            <SheetTrigger className="flex items-center gap-1.5 text-[14px] text-slate-500" aria-label={`${w.total}: ${w.totalFor}`}>{w.total}<Info size={16} aria-hidden /></SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-[20px] pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SheetHeader><SheetTitle className="text-[18px] text-plum">{w.totalFor}</SheetTitle><SheetDescription className="text-[15px] text-slate-600">{w.totalInfo}</SheetDescription></SheetHeader>
            </SheetContent>
          </Sheet>
          <span className="text-[22px] font-black tracking-[-.02em] text-plum">{amount}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => open("change")} className="h-12 rounded-xl bg-amber-500 px-2 text-[16px] font-bold leading-tight text-white hover:bg-amber-600">{w.askChange}</button>
          <button type="button" onClick={() => open("accept")} className="h-12 rounded-xl bg-[#EE6A2C] px-2 text-[16px] font-bold text-white hover:bg-[#D95A1F]">{w.bookNow}</button>
        </div>
      </div>
    </div>}
  </div>;
}

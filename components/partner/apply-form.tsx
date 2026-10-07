"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";

const KINDS: [string, string][] = [["creator", "Blogger / creator"], ["hotel", "Hotel / stay"], ["guide", "Guide / tours"], ["business", "Local business"], ["other", "Other"]];

/** The application form on waydidi.com/partners. */
export function PartnerApplyForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", kind: "creator", website: "", audience: "", pitch: "", wanted: "", agree: false, company: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/partners/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, company: f.company || undefined }) });
      const d = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) setError(d.error ?? "Couldn't send. Please try again.");
      else setDone(true);
    } catch { setError("Couldn't send. Please check your connection."); }
    setBusy(false);
  }

  if (done) return <div className="rounded-2xl bg-white p-6 text-center shadow-[0_6px_24px_rgba(33,23,38,.08)]">
    <CheckCircle2 size={44} className="mx-auto text-[#2F7A6B]" />
    <h3 className="mt-3 text-[22px] font-bold">Thank you, application sent</h3>
    <p className="mt-2 text-[15px] text-slate-600">We usually reply within 1 business day. Once approved, you&apos;ll get an email with your link, your code and your partner dashboard.</p>
  </div>;

  const field = "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[15px] outline-none focus:border-[#FE8B05] focus:ring-2 focus:ring-[#FE8B05]/20";
  const label = "grid gap-1.5 text-[14px] font-semibold text-[#211726]";
  return <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(33,23,38,.08)] sm:grid-cols-2 sm:p-7">
    <label className={`${label} sm:col-span-2`}>Your name or business name<input required value={f.name} onChange={set("name")} maxLength={80} className={field} placeholder="e.g. Mint Travels" /></label>
    <label className={label}>Email<input required type="email" value={f.email} onChange={set("email")} className={field} placeholder="you@example.com" /></label>
    <label className={label}>Phone / WhatsApp / LINE<input value={f.phone} onChange={set("phone")} maxLength={40} className={field} placeholder="Optional" /></label>
    <label className={label}>You are a…<select value={f.kind} onChange={set("kind")} className={field}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label className={label}>Website or social page<input value={f.website} onChange={set("website")} maxLength={300} className={field} placeholder="e.g. instagram.com/minttravels" /></label>
    <label className={label}>Audience size<input value={f.audience} onChange={set("audience")} maxLength={120} className={field} placeholder="e.g. 20k followers, 40-room hotel" /></label>
    <label className={label}>Link name you&apos;d like<input value={f.wanted} onChange={set("wanted")} maxLength={40} className={field} placeholder="e.g. mint (waydidi.com/?ref=mint)" /></label>
    <label className={`${label} sm:col-span-2`}>How will you share Waydidi?<textarea value={f.pitch} onChange={set("pitch")} maxLength={1000} rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] font-normal outline-none focus:border-[#FE8B05]" placeholder="e.g. Blog posts about Phuket, QR card at our front desk, LINE group for guests" /></label>
    {/* Honeypot for bots: hidden from people */}
    <input tabIndex={-1} autoComplete="off" value={f.company} onChange={set("company")} aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" name="company" />
    <label className="flex items-start gap-2 text-[14px] text-slate-700 sm:col-span-2">
      <input type="checkbox" required checked={f.agree} onChange={set("agree")} className="mt-0.5 size-4 shrink-0 accent-[#FE8B05]" />
      <span>I agree to the partner terms below: commission is paid on completed rides only, no self-bookings, and no paid search ads using the Waydidi name.</span>
    </label>
    {error && <p role="alert" className="text-[14px] text-red-600 sm:col-span-2">{error}</p>}
    <button type="submit" disabled={busy} className="flex h-[52px] items-center justify-center gap-2 rounded-xl bg-[#FE8B05] text-[17px] font-semibold text-white hover:bg-[#E67900] disabled:opacity-60 sm:col-span-2">{busy && <LoaderCircle size={18} className="animate-spin" />}{busy ? "Sending…" : "Apply to join"}</button>
  </form>;
}

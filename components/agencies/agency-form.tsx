"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

const field = "mt-1.5 h-12 w-full rounded-xl border border-[#DAD7CF] bg-white px-4 text-[16px] text-[#111] outline-none focus:border-[#111]";
const label = "block text-[14px] font-semibold text-[#111]";

// Partner application form: stored for the Waydidi team to review.
export function AgencyForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/agencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      if (!res.ok) { setError({ text: body.error ?? "Something went wrong. Please try again.", field: body.field }); return; }
      setDone(true);
    } catch {
      setError({ text: "We couldn't send your application. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="rounded-[28px] bg-white p-8 text-center">
    <CheckCircle2 className="mx-auto text-[#0E9F6E]" size={44} aria-hidden="true" />
    <p className="mt-4 text-[24px] font-bold tracking-[-.02em]">Application received</p>
    <p className="mt-2 text-[16px] leading-7 text-[#5B5B5B]">Thanks for your interest. Our partnerships team will review your details and email you within 2 working days.</p>
  </div>;

  return <form onSubmit={submit} className="grid gap-5 rounded-[28px] border border-[#E4E1DA] bg-white p-6 sm:grid-cols-2 sm:p-8" noValidate>
    <label className={label}>Agency name<input name="agencyName" required autoComplete="organization" className={field} /></label>
    <label className={label}>Your name<input name="contactName" required autoComplete="name" className={field} /></label>
    <label className={label}>Work email<input name="email" type="email" required autoComplete="email" className={field} /></label>
    <label className={label}>Phone / WhatsApp<input name="phone" type="tel" required autoComplete="tel" className={field} /></label>
    <label className={label}>Country<input name="country" required autoComplete="country-name" className={field} /></label>
    <label className={label}>Website <span className="font-normal text-[#8A8A8A]">(optional)</span><input name="website" type="url" placeholder="https://" className={field} /></label>
    <label className={`${label} sm:col-span-2`}>Transfers per month for Thailand
      <select name="monthlyTransfers" defaultValue="1-10" className={field}>
        <option value="1-10">1–10</option><option value="11-50">11–50</option><option value="51-200">51–200</option><option value="200+">More than 200</option>
      </select>
    </label>
    <label className={`${label} sm:col-span-2`}>Anything we should know? <span className="font-normal text-[#8A8A8A]">(optional)</span><textarea name="message" rows={4} className={`${field} h-auto py-3`} placeholder="Main routes, group sizes, how you'd like to pay…" /></label>
    {/* Hidden from people; bots fill it in. */}
    <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    {error && <p className="rounded-xl bg-red-50 p-3 text-[14px] font-semibold text-red-700 sm:col-span-2" role="alert">{error.text}</p>}
    <div className="sm:col-span-2">
      <button type="submit" disabled={busy} className="h-14 rounded-full bg-[#FF8A05] px-10 text-[17px] font-bold text-[#111] hover:bg-[#F07A00] disabled:opacity-60">{busy ? "Sending…" : "Send application"}</button>
      <p className="mt-3 text-[13px] text-[#8A8A8A]">We use these details only to review your application and contact you. See our <a href="/privacy" className="underline">privacy policy</a>.</p>
    </div>
  </form>;
}

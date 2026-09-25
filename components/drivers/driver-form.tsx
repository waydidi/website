"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

const field = "mt-1.5 h-12 w-full min-w-0 rounded-xl border border-[#DCDFE6] bg-[#F4F5F8] px-4 text-[16px] text-[#111] outline-none focus:border-[#111] focus:bg-white";
const label = "block text-[13px] font-semibold text-[#111]";

// Driver application (Daytrip-style "Register online" step).
export function DriverForm() {
  const [type, setType] = useState<"individual" | "fleet">("individual");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = { ...Object.fromEntries(new FormData(event.currentTarget).entries()), applicantType: type };
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/drivers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(body.error ?? "Something went wrong. Please try again."); return; }
      setDone(true);
    } catch {
      setError("We couldn't send your application. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="rounded-[28px] bg-white p-8 text-center">
    <CheckCircle2 className="mx-auto text-[#0E9F6E]" size={44} aria-hidden="true" />
    <p className="mt-4 text-[22px] font-bold tracking-[-.02em]">Application received</p>
    <p className="mt-2 text-[15px] leading-6 text-[#5B5B5B]">Thanks for applying. Our operations team will review your details and contact you about the next steps and documents.</p>
  </div>;

  const tab = (value: "individual" | "fleet", text: string) => <button type="button" onClick={() => setType(value)} aria-pressed={type === value} className={`h-10 flex-1 rounded-full text-[14px] font-semibold ${type === value ? "bg-white text-[#111] shadow-sm" : "text-[#666]"}`}>{text}</button>;

  return <form onSubmit={submit} className="grid gap-4 rounded-[28px] bg-white p-6 sm:grid-cols-2 sm:p-8" noValidate>
    <div className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-[#111]">Are you registering as an individual driver or as a fleet owner with multiple drivers?</p>
      <div className="mt-2 flex rounded-full bg-[#EEF0F4] p-1">{tab("individual", "Individual driver")}{tab("fleet", "Fleet owner")}</div>
    </div>
    <label className={label}>{type === "fleet" ? "Your name" : "Full name"}<input name="fullName" required autoComplete="name" className={field} /></label>
    <label className={label}>Email address<input name="email" type="email" required autoComplete="email" className={field} /></label>
    <label className={label}>Phone / LINE / WhatsApp<input name="phone" type="tel" required autoComplete="tel" placeholder="+66" className={field} /></label>
    <label className={label}>City where you operate<input name="city" required placeholder="e.g. Bangkok, Pattaya, Phuket" className={field} /></label>
    <label className={label}>{type === "fleet" ? "Main vehicle type" : "Your vehicle"}
      <select name="vehicle" defaultValue="sedan" className={field}><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="van">Van / minivan</option><option value="none">I don&apos;t have a vehicle yet</option></select>
    </label>
    {type === "fleet"
      ? <label className={label}>Number of vehicles<input name="fleetSize" inputMode="numeric" className={field} /></label>
      : <label className={label}>Vehicle year <span className="font-normal text-[#8A8A8A]">(optional)</span><input name="vehicleYear" inputMode="numeric" maxLength={4} placeholder="2021" className={field} /></label>}
    <label className={`${label} sm:col-span-2`}>Languages you speak <span className="font-normal text-[#8A8A8A]">(optional)</span><input name="languages" placeholder="Thai, English…" className={field} /></label>
    <label className={`${label} sm:col-span-2`}>Anything else? <span className="font-normal text-[#8A8A8A]">(optional)</span><textarea name="message" rows={3} className={`${field} h-auto py-3`} placeholder="Years of driving experience, airports you know well…" /></label>
    <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    {error && <p className="rounded-xl bg-red-50 p-3 text-[14px] font-semibold text-red-700 sm:col-span-2" role="alert">{error}</p>}
    <div className="sm:col-span-2">
      <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#FF8A05] text-[16px] font-bold text-white hover:bg-[#F07A00] disabled:opacity-60 sm:w-auto sm:px-10">{busy ? "Sending…" : "Apply to drive"}</button>
      <p className="mt-3 text-[12px] text-[#8A8A8A]">We use these details only to review your application. See our <a href="/privacy" className="underline">privacy policy</a>.</p>
    </div>
  </form>;
}

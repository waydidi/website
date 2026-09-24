"use client";

import { FormEvent, useState } from "react";

type Profile = { name: string; surname: string; phone: string; contactPreference: string };
const preferences = [["email", "Email"], ["phone", "Phone call"], ["whatsapp", "WhatsApp"], ["line", "LINE"]] as const;

export function ProfileForm({ initial, email }: { initial: Profile; email: string }) {
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const set = (key: keyof Profile) => (event: { target: { value: string } }) => { setForm({ ...form, [key]: event.target.value }); setState({ kind: "idle" }); };
  async function save(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "saving" });
    const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setState(response.ok ? { kind: "saved" } : { kind: "error", message: data.error ?? "Could not save your profile." });
  }
  const field = "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#FF8A05] focus:ring-4 focus:ring-orange-100";
  return <form onSubmit={save} className="rounded-[22px] bg-white p-6 sm:p-8">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-bold">First name<input className={field} value={form.name} onChange={set("name")} autoComplete="given-name" maxLength={80} /></label>
      <label className="block text-sm font-bold">Surname<input className={field} value={form.surname} onChange={set("surname")} autoComplete="family-name" maxLength={80} /></label>
      <label className="block text-sm font-bold">Email<input className={`${field} bg-slate-50 text-slate-500`} value={email} readOnly aria-describedby="email-help" /><span id="email-help" className="mt-1 block font-normal text-slate-500">Your sign-in email. Bookings made with it appear in your account.</span></label>
      <label className="block text-sm font-bold">Phone<input className={field} value={form.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" placeholder="+66 81 234 5678" maxLength={40} /></label>
    </div>
    <fieldset className="mt-6"><legend className="text-sm font-bold">How should we contact you about a trip?</legend>
      <div className="mt-3 flex flex-wrap gap-2">{preferences.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-bold ${form.contactPreference === value ? "border-[#FF8A05] bg-[#FFF0DF] text-[#C96100]" : "border-slate-200"}`}><input type="radio" name="contact" value={value} checked={form.contactPreference === value} onChange={set("contactPreference")} className="sr-only" />{label}</label>)}</div>
    </fieldset>
    <p className="mt-6 text-sm text-slate-500">These details pre-fill your next booking. Changing them does not change bookings you have already made.</p>
    <div className="mt-6 flex items-center gap-4">
      <button disabled={state.kind === "saving"} className="rounded-full bg-[#FF8A05] px-7 py-3 font-black text-white disabled:opacity-60">{state.kind === "saving" ? "Saving…" : "Save changes"}</button>
      <span role="status" className={`text-sm font-bold ${state.kind === "error" ? "text-red-600" : "text-emerald-700"}`}>{state.kind === "saved" ? "Saved" : state.kind === "error" ? state.message : ""}</span>
    </div>
  </form>;
}

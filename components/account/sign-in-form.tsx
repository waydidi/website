"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from "lucide-react";

// Only same-site paths are allowed as a post-sign-in destination.
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/account";
}

export function SignInForm({ next, initialEmail }: { next: string | null; initialEmail?: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  async function post(path: string, body: object) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: response.ok, error: data.error ?? "Something went wrong. Please try again." };
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true); setError(""); setNotice("");
    const result = await post("/api/account/code", { email });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setStep("code"); setCode(""); setNotice(`We sent a 6-digit code to ${email.trim()}.`);
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const result = await post("/api/account/verify", { email, code });
    if (!result.ok) { setLoading(false); return setError(result.error); }
    window.location.assign(safeNext(next));
  }

  const input = "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg outline-none transition focus:border-[#FF8A05] focus:ring-4 focus:ring-orange-100";
  return <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-9">
    {step === "email" ? <form onSubmit={requestCode} noValidate>
      <span className="grid size-12 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><Mail /></span>
      <h1 className="mt-5 text-3xl font-black tracking-[-.035em]">Sign in or create an account</h1>
      <p className="mt-2 leading-7 text-slate-600">Use the email you book with. We will send you a one-time code, so there is no password to remember.</p>
      <label className="mt-7 block text-sm font-bold" htmlFor="account-email">Email address</label>
      <input id="account-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
      <button disabled={loading || !email.trim()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-6 py-4 font-black text-white disabled:opacity-60">{loading ? "Sending code…" : <>Send code <ArrowRight size={18} /></>}</button>
    </form> : <form onSubmit={verify} noValidate>
      <button type="button" onClick={() => { setStep("email"); setError(""); }} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#D96F00]"><ArrowLeft size={16} /> Change email</button>
      <h1 className="mt-5 text-3xl font-black tracking-[-.035em]">Enter your code</h1>
      <p role="status" className="mt-2 leading-7 text-slate-600">{notice} It expires in 10 minutes.</p>
      <label className="mt-7 block text-sm font-bold" htmlFor="account-code">6-digit code</label>
      <input id="account-code" autoComplete="one-time-code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} text-center text-2xl font-black tracking-[.5em]`} placeholder="••••••" />
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
      <button disabled={loading || code.length !== 6} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-6 py-4 font-black text-white disabled:opacity-60">{loading ? "Checking…" : "Sign in"}</button>
      <button type="button" disabled={loading} onClick={() => requestCode()} className="mt-4 w-full text-sm font-bold text-[#C96100] hover:underline">Send a new code</button>
    </form>}
    <div className="mt-8 flex items-start gap-3 border-t border-slate-100 pt-6 text-sm leading-6 text-slate-600"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#D96F00]" /><p>Booked as a guest? Your past trips appear automatically once you sign in with the same email. You can also <Link href="/booking/manage" className="font-bold text-[#C96100] hover:underline">manage a booking without an account</Link>.</p></div>
  </div>;
}

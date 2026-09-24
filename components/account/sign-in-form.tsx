"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, BadgeCheck, CarFront } from "lucide-react";
import type { SocialProvider } from "@/lib/social-auth";

// Only same-site paths are allowed as a post-sign-in destination.
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/account";
}

const PROVIDER_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Choose a way to continue.",
  expired: "That sign-in took too long or was opened in another browser. Please try again.",
  failed: "We could not complete that sign-in. Please try again or use your email.",
  no_email: "That account did not share a verified email address. Please sign in with your email instead.",
  unavailable: "That sign-in option is not available right now. Please use your email.",
  rate_limited: "Too many attempts. Please wait 15 minutes.",
};

function GoogleIcon() {
  return <svg viewBox="0 0 48 48" className="size-6" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>;
}

function AppleIcon() {
  return <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true"><path fill="#000" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>;
}

function LineIcon() {
  return <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="#06C755" />
    <path fill="#fff" d="M12 5.2c-4.3 0-7.8 2.8-7.8 6.3 0 3.1 2.8 5.7 6.5 6.2.3.1.6.2.7.4.1.2.1.5 0 .7l-.1.7c0 .2-.2.8.7.4.9-.4 4.8-2.8 6.5-4.8 1.2-1.3 1.3-2.4 1.3-3.6 0-3.5-3.5-6.3-7.8-6.3z" />
    <path fill="#06C755" d="M8.3 9.6h-.6c-.1 0-.2.1-.2.2v3.5c0 .1.1.2.2.2h2c.1 0 .2-.1.2-.2v-.5c0-.1-.1-.2-.2-.2H8.5V9.8c0-.1-.1-.2-.2-.2zm2.4 0h-.5c-.1 0-.2.1-.2.2v3.5c0 .1.1.2.2.2h.5c.1 0 .2-.1.2-.2V9.8c0-.1-.1-.2-.2-.2zm3.5 0h-.5c-.1 0-.2.1-.2.2v2l-1.6-2.1-.1-.1h-.5c-.1 0-.2.1-.2.2v3.5c0 .1.1.2.2.2h.5c.1 0 .2-.1.2-.2v-2l1.6 2.1.1.1h.5c.1 0 .2-.1.2-.2V9.8c0-.1-.1-.2-.2-.2zm2.4 0h-2c-.1 0-.2.1-.2.2v3.5c0 .1.1.2.2.2h2c.1 0 .2-.1.2-.2v-.5c0-.1-.1-.2-.2-.2h-1.3v-.5h1.3c.1 0 .2-.1.2-.2v-.5c0-.1-.1-.2-.2-.2h-1.3v-.5h1.3c.1 0 .2-.1.2-.2v-.5c0-.1-.1-.2-.2-.2z" />
  </svg>;
}

function FacebookIcon() {
  return <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true"><path fill="#0866FF" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" /></svg>;
}

const PROVIDERS: Record<SocialProvider, { label: string; icon: () => React.JSX.Element }> = {
  google: { label: "Google", icon: GoogleIcon },
  apple: { label: "Apple", icon: AppleIcon },
  line: { label: "LINE", icon: LineIcon },
  facebook: { label: "Facebook", icon: FacebookIcon },
};

export function SignInForm({ next, initialEmail, providers, providerError }: { next: string | null; initialEmail?: string; providers: SocialProvider[]; providerError?: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState(providerError ? PROVIDER_ERRORS[providerError] ?? PROVIDER_ERRORS.failed : "");
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

  const input = "h-14 w-full rounded-lg border border-slate-300 bg-white px-5 text-lg text-[#0F294D] outline-none transition placeholder:text-slate-400 focus:border-[#FF8A05] focus:ring-2 focus:ring-orange-100";
  const primary = "flex h-[52px] w-full items-center justify-center rounded-lg bg-[#FF8A05] text-lg font-medium text-white transition hover:bg-[#F07F00] disabled:opacity-60";
  const nextParam = encodeURIComponent(safeNext(next));

  return <div className="flex min-h-[calc(100dvh-59px)] flex-col lg:min-h-[calc(100dvh-97px)]">
    <div className="flex-1">
      {step === "email" ? <>
        <h1 className="text-center text-[26px] font-bold text-[#0F294D]">Sign in / register</h1>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[15px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><CarFront size={17} className="text-[#FF8A05]" aria-hidden="true" />Manage every trip</span>
          <span className="text-slate-300" aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1.5"><BadgeCheck size={17} className="text-[#FF8A05]" aria-hidden="true" />Faster booking</span>
        </p>
        {error ? <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <form onSubmit={requestCode} noValidate className="mt-7 grid gap-4">
          <label htmlFor="account-email" className="sr-only">Email address</label>
          <input id="account-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="Email" />
          <button disabled={loading} className={primary}>{loading ? "Sending code…" : "Continue"}</button>
        </form>
        {providers.length ? <>
          <div className="my-6 flex items-center gap-4 text-[15px] text-slate-500"><span className="h-px flex-1 bg-slate-200" />Or<span className="h-px flex-1 bg-slate-200" /></div>
          <div className="grid gap-3">{providers.map((id) => {
            const { label, icon: Icon } = PROVIDERS[id];
            // Plain link: the server redirects on to the provider's sign-in page.
            return <a key={id} href={`/api/account/oauth/${id}/start?next=${nextParam}`} className="flex h-[52px] items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-lg font-medium text-[#0F294D] transition hover:border-slate-400 hover:bg-slate-50"><Icon />{label}</a>;
          })}</div>
        </> : null}
      </> : <form onSubmit={verify} noValidate>
        <button type="button" onClick={() => { setStep("email"); setError(""); }} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-[#D96F00]"><ArrowLeft size={16} /> Change email</button>
        <h1 className="mt-5 text-center text-[26px] font-bold text-[#0F294D]">Enter your code</h1>
        <p role="status" className="mt-3 text-center text-[15px] text-slate-500">{notice} It expires in 10 minutes.</p>
        {error ? <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <label className="sr-only" htmlFor="account-code">6-digit code</label>
        <input id="account-code" autoComplete="one-time-code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} mt-7 text-center text-2xl tracking-[.5em]`} placeholder="••••••" />
        <button disabled={loading || code.length !== 6} className={`${primary} mt-4`}>{loading ? "Checking…" : "Sign in"}</button>
        <button type="button" disabled={loading} onClick={() => requestCode()} className="mt-5 w-full text-[15px] font-medium text-[#C96100] hover:underline">Send a new code</button>
      </form>}
    </div>
    <p className="mt-10 pb-6 text-sm leading-6 text-slate-500">
      By signing in or registering, you agree to Waydidi&apos;s <Link href="/terms" className="underline">Terms of Service</Link> and <Link href="/privacy" className="underline">Privacy Notice</Link>. Booked as a guest? You can also <Link href="/booking/manage" className="underline">manage a booking without an account</Link>.
    </p>
  </div>;
}

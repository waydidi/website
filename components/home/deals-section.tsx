"use client";

import { BadgePercent, Check, Mail, ShieldCheck, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTurnstile } from "@/components/use-turnstile";

// Trip.com-style block: newsletter sign-up, a sign-in card for member deals,
// and "Book with confidence" reasons.
export function DealsSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const turnstile = useTurnstile("newsletter");
  const [hidden, setHidden] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("waydidi-newsletter-hidden") === "1") setHidden(true); } catch { /* storage blocked */ } // eslint-disable-line react-hooks/set-state-in-effect
    fetch("/api/account/session", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { signedIn: false })).then((d: { signedIn?: boolean }) => setSignedIn(Boolean(d.signedIn))).catch(() => undefined);
  }, []);
  async function subscribe(event: React.FormEvent) {
    event.preventDefault();
    setState("busy"); setError("");
    const res = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "home-deals", turnstileToken: await turnstile.getToken() }) }).catch(() => null);
    if (!res?.ok) { setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? "Couldn't subscribe. Please try again."); setState("idle"); return; }
    setState("done");
  }
  const card = "rounded-2xl bg-white p-5 shadow-[0_2px_10px_rgba(15,41,77,.06)] sm:p-6";
  const reasons = [
    { Icon: ShieldCheck, title: "Free cancellation up to 48 hours", text: "Cancel more than 48 hours before pickup for a full refund.", href: "/refund-policy" },
    { Icon: BadgePercent, title: "Get rewarded for traveling", text: "Members get 10% off every 5th completed ride, plus member-only deals.", href: "/account/sign-in" },
  ];
  return <section aria-labelledby="deals-heading" className="bg-[#EEF0F4] px-4 py-10 sm:py-14">
    <div className="mx-auto grid max-w-[880px] grid-cols-[minmax(0,1fr)] gap-4">
      {turnstile.widget}
      {!hidden && <div className={`${card} relative`}>
        <button type="button" aria-label="Hide newsletter sign-up" onClick={() => { setHidden(true); try { localStorage.setItem("waydidi-newsletter-hidden", "1"); } catch { /* storage blocked */ } }} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        <p className="flex gap-3 pr-8 text-[17px] font-semibold leading-snug text-[#0F294D] sm:text-[19px]"><Mail className="mt-0.5 size-6 shrink-0 text-[#FF8A05]" aria-hidden="true" />Yes, I&apos;d like to save on my Thailand rides! Please send me exclusive deals and updates.</p>
        {state === "done" ? <p role="status" className="mt-4 rounded-xl bg-[#ECFDF3] p-3 text-[15px] font-semibold text-[#067647]">Thanks! You&apos;re subscribed. Watch your inbox for deals.</p>
          : <form onSubmit={subscribe} className="mt-4 flex gap-3" noValidate>
            <label htmlFor="deals-email" className="sr-only">Email address</label>
            <input id="deals-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email" className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-[16px] outline-none focus:border-[#FF8A05]" />
            <button type="submit" disabled={!email.trim() || state === "busy"} className="h-12 shrink-0 rounded-lg bg-[#FF8A05] px-5 text-[16px] font-semibold text-white disabled:bg-slate-300">{state === "busy" ? "Sending…" : "Subscribe"}</button>
          </form>}
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      </div>}

      <div className={card}>
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#FF8A05]"><Image src="/waydidi-bird.png" alt="" width={36} height={36} className="brightness-0 invert" /></span>
          <h2 id="deals-heading" className="text-[18px] font-semibold leading-snug text-[#0F294D] sm:text-[21px]">Want access to exclusive deals? {signedIn ? "They're in your account." : "Sign in to Waydidi!"}</h2>
        </div>
        <ul className="mt-4 grid gap-2.5 pl-1 text-[15px] text-[#455873] sm:pl-[72px] sm:text-[16px]">
          {["Member-only promo codes", "Plan and book your next ride wherever you are", "Easy booking management"].map((line) => <li key={line} className="flex items-center gap-3"><Check size={20} strokeWidth={2.5} className="shrink-0 text-[#FF8A05]" aria-hidden="true" />{line}</li>)}
        </ul>
        <div className="mt-5 flex justify-center"><Link href={signedIn ? "/account" : "/account/sign-in"} className="inline-flex h-12 min-w-40 items-center justify-center rounded-lg bg-[#FF8A05] px-8 text-[16px] font-semibold text-white hover:bg-[#E67900]">{signedIn ? "My account" : "Sign in"}</Link></div>
      </div>

      <div className="mt-4">
        <h2 className="text-[22px] font-semibold tracking-[-.01em] text-[#0F294D] sm:text-[26px]">Book with confidence on Waydidi.com</h2>
        <ul className="mt-5 grid gap-6">
          {reasons.map(({ Icon, title, text, href }) => <li key={title} className="flex gap-4">
            <Icon className="mt-0.5 size-8 shrink-0 text-[#FF8A05]" aria-hidden="true" />
            <div><p className="text-[18px] font-semibold text-[#0F294D]">{title}</p><p className="mt-1 text-[15px] leading-relaxed text-[#455873]">{text} <Link href={href} className="text-[#E57A00] underline underline-offset-2">Learn more</Link></p></div>
          </li>)}
        </ul>
      </div>
    </div>
  </section>;
}

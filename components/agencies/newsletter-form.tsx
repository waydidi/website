"use client";

import { useState } from "react";

// Black newsletter band (Transfeero layout).
export function NewsletterForm({ source }: { source: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setState("busy"); setError("");
    const res = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source }) }).catch(() => null);
    if (!res?.ok) { setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? "Couldn't subscribe. Please try again."); setState("idle"); return; }
    setState("done");
  }
  if (state === "done") return <p className="mt-8 rounded-2xl border border-white/15 p-5 text-[15px] font-semibold">Thanks! You&apos;re subscribed. Watch your inbox for news and offers.</p>;
  return <form onSubmit={submit} className="mt-8 grid min-w-0 grid-cols-1 gap-4" noValidate>
    <label className="sr-only" htmlFor="newsletter-email">Email address</label>
    <input id="newsletter-email" name="email" type="email" required autoComplete="email" placeholder="Enter your email address" className="h-14 w-full min-w-0 rounded-2xl border border-white/20 bg-[#161616] px-6 text-[16px] text-white outline-none placeholder:text-white/50 focus:border-white/60" />
    {error && <p className="text-[14px] font-semibold text-red-300" role="alert">{error}</p>}
    <button type="submit" disabled={state === "busy"} className="h-14 rounded-2xl bg-[#FF8A05] text-[16px] font-bold text-[#111] hover:bg-[#F07A00] disabled:opacity-60">{state === "busy" ? "Subscribing…" : "Subscribe"}</button>
  </form>;
}

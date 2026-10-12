"use client";

import { useCallback, useEffect, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";

// The LIFF SDK, loaded only on /liff. Pinned to the v2 "edge" channel LINE documents for LIFF v2.
const SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";
type Liff = { init: (o: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; login: (o?: { redirectUri?: string }) => void; getIDToken: () => string | null; isInClient: () => boolean };
type State = { step: "loading" } | { step: "no_email" } | { step: "error"; message: string };

function loadSdk(): Promise<Liff> {
  const w = window as unknown as { liff?: Liff };
  if (w.liff) return Promise.resolve(w.liff);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK;
    script.async = true;
    script.onload = () => (w.liff ? resolve(w.liff) : reject(new Error("LINE did not load.")));
    script.onerror = () => reject(new Error("LINE could not be reached. Check your connection."));
    document.head.appendChild(script);
  });
}

/** Signs the customer in with their LINE account, then opens their trips. */
export function LiffEntry({ liffId, next }: { liffId: string; next: string }) {
  const [state, setState] = useState<State>({ step: "loading" });

  const start = useCallback(async () => {
    setState({ step: "loading" });
    try {
      const liff = await loadSdk();
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error("LINE did not share your sign-in. Please allow access and try again.");
      const res = await fetch("/api/liff/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (res.ok) { window.location.replace(next); return; }
      if (data.error === "no_email") { setState({ step: "no_email" }); return; }
      throw new Error(data.error === "rate_limited" ? "Too many attempts. Please wait a few minutes." : "We could not sign you in with LINE.");
    } catch (e) { setState({ step: "error", message: e instanceof Error ? e.message : "Something went wrong." }); }
  }, [liffId, next]);

  useEffect(() => { const t = window.setTimeout(() => { void start(); }, 0); return () => window.clearTimeout(t); }, [start]);

  const signIn = `/account/sign-in?next=${encodeURIComponent(`/liff?next=${encodeURIComponent(next)}`)}`;
  return <section className="rounded-card bg-white p-6 text-center" aria-live="polite">
    <WaydidiLogo className="mx-auto h-[53px] w-[139px]" />
    {state.step === "loading" ? <p className="mt-6 font-bold">Signing you in with LINE…</p> : null}
    {state.step === "no_email" ? <>
      <h1 className="mt-6 text-xl font-black">Connect your Waydidi account</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">LINE did not share an email address, so we can&apos;t find your bookings yet. Sign in once with the email you booked with; after that LINE signs you in automatically.</p>
      <a href={signIn} className="mt-5 inline-flex min-h-tap items-center rounded-full bg-brand px-6 font-black text-ink">Sign in with email</a>
    </> : null}
    {state.step === "error" ? <>
      <p role="alert" className="mt-6 font-bold text-danger">{state.message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button onClick={() => void start()} className="min-h-tap rounded-full bg-brand px-6 font-black text-ink">Try again</button>
        <a href={signIn} className="inline-flex min-h-tap items-center rounded-full bg-slate-100 px-6 font-bold">Use email instead</a>
      </div>
    </> : null}
  </section>;
}

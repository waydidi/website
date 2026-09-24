"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, LogOut } from "lucide-react";

export function SettingsPanel({ marketingOptIn, deviceCount }: { marketingOptIn: boolean; deviceCount: number }) {
  const [marketing, setMarketing] = useState(marketingOptIn);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function toggleMarketing(value: boolean) {
    setMarketing(value); setError("");
    const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketingOptIn: value }) });
    if (!response.ok) { setMarketing(!value); setError("Could not update your email preference."); }
  }
  async function signOut(everywhere: boolean) {
    setBusy(everywhere ? "everywhere" : "here");
    await fetch(`/api/account/session${everywhere ? "?everywhere=1" : ""}`, { method: "DELETE" });
    window.location.assign("/");
  }
  const card = "rounded-[22px] bg-white p-6 sm:p-7";
  return <div className="grid gap-5">
    <section className={card} aria-labelledby="emails">
      <h2 id="emails" className="font-black">Emails</h2>
      <p className="mt-1 text-sm text-slate-600">Booking confirmations and trip reminders are always sent, because they contain your pickup details.</p>
      <label className="mt-5 flex cursor-pointer items-center justify-between gap-4"><span className="font-bold">Offers and travel ideas from Waydidi</span>
        <input type="checkbox" role="switch" checked={marketing} onChange={(e) => toggleMarketing(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-slate-200 transition after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:bg-[#FF8A05] peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-orange-100" />
      </label>
    </section>

    <section className={card} aria-labelledby="devices">
      <h2 id="devices" className="font-black">Signed-in devices</h2>
      <p className="mt-1 text-sm text-slate-600">You are signed in on {deviceCount} {deviceCount === 1 ? "device" : "devices"}. Sessions last 30 days after you last use them.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={() => signOut(false)} disabled={!!busy} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 font-black hover:border-[#FF8A05]"><LogOut size={18} />Sign out</button>
        <button onClick={() => signOut(true)} disabled={!!busy} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 font-black hover:border-[#FF8A05]">Sign out of all devices</button>
      </div>
    </section>

    <section className={card} aria-labelledby="privacy">
      <h2 id="privacy" className="font-black">Your data (PDPA)</h2>
      <p className="mt-1 text-sm text-slate-600">Download a copy of your profile and bookings. See the <Link href="/privacy" className="font-bold text-[#C96100] hover:underline">privacy notice</Link>.</p>
      {/* A plain link: this is a file download, not a page navigation. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/api/account/export" className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 font-black hover:border-[#FF8A05]"><Download size={18} />Download my data</a>
      <p className="mt-6 text-sm text-slate-600">Want your account deleted? <Link href="/help" className="font-bold text-[#C96100] hover:underline">Contact support</Link> and our team will remove it for you.</p>
      {error ? <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p> : null}
    </section>
  </div>;
}

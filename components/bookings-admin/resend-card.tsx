"use client";

import { useState } from "react";

// Posts the booking's card to the team Telegram group again (Admin → booking details → Telegram).
export function ResendCardButton({ reference }: { reference: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  async function send() {
    setState("sending"); setError("");
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(reference)}/telegram-card`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    if (res?.ok) { setState("sent"); window.setTimeout(() => setState("idle"), 3000); return; }
    const data = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setError(data?.error ?? "Couldn't send to Telegram. Try again."); setState("idle");
  }
  return <span className="inline-flex flex-col items-end">
    <button type="button" onClick={send} disabled={state === "sending"} className="font-semibold text-brand-darker underline underline-offset-4 disabled:opacity-50">{state === "sending" ? "Sending…" : state === "sent" ? "Sent ✓" : "Re-send card"}</button>
    {error && <span role="alert" className="text-[12px] font-normal text-red-700">{error}</span>}
  </span>;
}

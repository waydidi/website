"use client";

import { Check, Send } from "lucide-react";
import { useState } from "react";

// Posts the driver job message for a booking to the team Telegram group.
export function SendJobButton({ reference }: { reference: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  async function send() {
    setState("sending"); setError("");
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(reference)}/telegram-job`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    if (res?.ok) { setState("sent"); window.setTimeout(() => setState("idle"), 2000); return; }
    const data = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setError(data?.error ?? "Couldn't send to Telegram. Try again."); setState("idle");
  }
  return <button type="button" onClick={send} disabled={state === "sending"} title={error || "Send job to Telegram"} aria-label={error ? `Send job for ${reference} to Telegram. ${error}` : `Send job for ${reference} to Telegram`}
    className={`grid size-9 place-items-center rounded-full border disabled:opacity-50 ${state === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : error ? "border-red-200 text-red-700 hover:bg-red-50" : "border-orange-200 text-brand-text hover:bg-orange-50"}`}>
    {state === "sent" ? <Check size={16} /> : <Send size={16} />}
  </button>;
}

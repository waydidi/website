"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Copies a ready-made text (e.g. the driver job message) to the clipboard.
export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" title={text} aria-label={label} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ }
  }} className={`grid size-9 place-items-center rounded-full border ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 text-[#D96F00] hover:bg-orange-50"}`}>
    {done ? <Check size={16} /> : <Copy size={16} />}
  </button>;
}

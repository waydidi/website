"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Clock, FileImage, XCircle } from "lucide-react";

export type SlipSummary = { id: string; status: "needs_review" | "approved" | "rejected"; amountMinor: number | null; createdAt: string; note: string | null };

const baht = (minor: number) => `฿${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const STATUS = {
  needs_review: { label: "Checking", icon: Clock, tone: "bg-warning-soft text-warning" },
  approved: { label: "Payment received", icon: CheckCircle2, tone: "bg-success-soft text-success" },
  rejected: { label: "Not accepted", icon: XCircle, tone: "bg-danger-soft text-danger" },
} as const;

/** Bank transfer / PromptPay slip upload for a "pay later" booking (G7: card, 44px tap targets, status tokens). */
export function PaymentSlipUpload({ reference, outstandingMinor, payeeDisplay, slips, canUpload }: { reference: string; outstandingMinor: number; payeeDisplay: string; slips: SlipSummary[]; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    if (file.size > 5 * 1024 * 1024) { setError("The image must be 5 MB or smaller."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("slip", file);
      const res = await fetch(`/api/account/trips/${encodeURIComponent(reference)}/slips`, { method: "POST", body });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed. Please try again.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Please try again."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return <section className="rounded-[22px] bg-white p-6" aria-labelledby="slip-title">
    <h2 id="slip-title" className="font-black">Pay by bank transfer or PromptPay</h2>
    {canUpload ? <>
      <p className="mt-1 text-sm leading-6 text-slate-600">Prefer not to pay cash? Transfer <strong className="text-plum">{baht(outstandingMinor)}</strong>{payeeDisplay ? <> to <strong className="text-plum">{payeeDisplay}</strong></> : null}, then upload the slip. We check it and update your booking.</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-4 inline-flex min-h-tap items-center gap-2 rounded-full bg-brand px-5 font-black text-ink hover:bg-brand-hover disabled:opacity-60"><FileImage size={18} aria-hidden="true" />{busy ? "Checking slip…" : "Upload slip"}</button>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-danger">{error}</p> : null}
    </> : <p className="mt-1 text-sm text-slate-600">Nothing is due on this booking.</p>}
    {slips.length ? <ul className="mt-5 grid gap-2">
      {slips.map((s) => { const st = STATUS[s.status]; const Icon = st.icon; return <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-3 text-sm">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${st.tone}`}><Icon size={14} />{st.label}</span>
        <span className="font-bold">{s.amountMinor ? baht(s.amountMinor) : "Amount being checked"}</span>
        <span className="w-full text-slate-500 sm:w-auto">{new Date(s.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</span>
        {s.note ? <span className="w-full text-slate-600">{s.note}</span> : null}
      </li>; })}
    </ul> : null}
  </section>;
}

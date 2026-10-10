"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LoaderCircle, UserRound, X } from "lucide-react";
import { Modal, ModalClose, ModalTitle } from "@/components/ui/modal";

/** "Sign in" in the corner of the maintenance page: admin ID + admin key (and authenticator code), then the admin panel. */
export function MaintenanceSignIn() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  const [mfa, setMfa] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mfa ? { code, remember } : { username, password: key, remember }) });
      const data = await res.json().catch(() => null) as { error?: string; mfaRequired?: boolean; enrollmentSecret?: string } | null;
      if (!res.ok) { setError(data?.error ?? "The admin ID or admin key is incorrect."); setKey(""); setCode(""); return; }
      if (data?.mfaRequired) { setMfa(true); setSecret(data.enrollmentSecret ?? null); setKey(""); return; }
      window.location.href = "/admin";
    } catch { setError("Couldn't sign in. Please try again."); }
    finally { setBusy(false); }
  }

  const field = "flex items-center rounded-xl border border-slate-300 bg-slate-50 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20";
  return <>
    <button type="button" onClick={() => setOpen(true)} className="absolute bottom-[calc(16px+env(safe-area-inset-bottom))] right-5 z-20 rounded-full px-3 py-1.5 text-[14px] font-semibold text-[#7A3A06] hover:bg-white/40">Sign in</button>
    <Modal open={open} onClose={() => setOpen(false)} asChild>
      <form onSubmit={submit} className="max-w-sm rounded-2xl p-6 text-left text-plum shadow-2xl">
        <ModalClose aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X size={20} /></ModalClose>
        <ModalTitle className="text-[22px] font-bold">Admin sign in</ModalTitle>
        <p className="mt-1 text-[14px] text-slate-500">{mfa ? "Enter the six-digit code from your authenticator app." : "Sign in to the Waydidi admin panel."}</p>
        {!mfa ? <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3">
          <label className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-[14px] font-semibold">Admin ID
            <span className={field}><UserRound size={18} className="shrink-0 text-slate-400" /><input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} placeholder="Enter admin ID" className="min-w-0 flex-1 bg-transparent px-2 py-3 font-normal outline-none" /></span>
          </label>
          <label className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-[14px] font-semibold">Admin key
            <span className={field}><KeyRound size={18} className="shrink-0 text-slate-400" /><input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" required minLength={8} maxLength={200} placeholder="Enter admin key" className="min-w-0 flex-1 bg-transparent px-2 py-3 font-normal outline-none" /></span>
          </label>
        </div> : <div className="mt-5">
          {secret && <div className="mb-3 rounded-xl bg-amber-50 p-3 text-[13px]"><p>Add this secret to your authenticator app, then enter its code.</p><code className="mt-1 block break-all select-all">{secret}</code></div>}
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="123456" aria-label="Authenticator code" className="w-full rounded-xl border border-slate-300 p-3 text-center text-[20px] tracking-[.3em]" />
        </div>}
        {/* Asked once with the ID and key; the choice is sent with the authenticator code. */}
        {!mfa && <label className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-slate-700">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-brand" />
          Stay signed in for 30 days
        </label>}
        {error && <p role="alert" className="mt-3 text-[14px] text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">{busy && <LoaderCircle size={18} className="animate-spin" />}{mfa ? "Verify" : "Sign in"}</button>
      </form>
    </Modal>
  </>;
}

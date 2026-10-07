"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LoaderCircle, UserRound } from "lucide-react";
import { AnimatedScene } from "@/components/maintenance/animated-scene";
import { WaydidiLogo } from "@/components/waydidi-logo";

export function AdminKeyLogin({ configured }: { configured: boolean }) {
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  const [mfa, setMfa] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mfa ? { code, remember } : { username, password: key }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(result?.error ?? "The admin ID or password is incorrect.");
        setKey("");
        return;
      }
      const result = await response.json() as { mfaRequired?: boolean; enrollmentSecret?: string };
      if (result.mfaRequired) { setMfa(true); setSecret(result.enrollmentSecret ?? null); setKey(""); return; }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatedScene>
      {/* Logo (bird + name) just above the box, 12px apart, both centred over the moving scene. */}
      <div className="relative z-20 flex min-h-dvh flex-col items-center justify-center px-4 pb-[16vh] pt-10">
      <WaydidiLogo className="h-[76px] w-auto text-white drop-shadow-[0_4px_12px_rgba(150,70,0,.3)]" />
      <section className="mt-3 w-full max-w-sm rounded-2xl bg-white p-6 text-plum shadow-2xl sm:p-7">
        <h1 className="text-[22px] font-bold">Admin sign in</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          {configured ? (mfa ? "Enter the six-digit code from your authenticator app." : "Sign in to the Waydidi admin panel.") : "Admin sign-in has not been set up yet."}
        </p>
        <form className="mt-5" onSubmit={submit}>
          {!mfa && <><label className="text-sm font-bold" htmlFor="admin-id">Admin ID</label>
          <div className="mb-4 mt-2 flex items-center rounded-xl border border-slate-300 bg-slate-50 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <UserRound className="shrink-0 text-slate-400" size={20} />
            <input id="admin-id" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} disabled={!configured || loading} className="min-w-0 flex-1 bg-transparent px-2 py-3 outline-none disabled:cursor-not-allowed" placeholder="Enter admin ID" required maxLength={100} />
          </div>
          <label className="text-sm font-bold" htmlFor="admin-key">Admin key</label>
          <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-slate-50 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <KeyRound className="shrink-0 text-slate-400" size={20} />
            <input
              id="admin-key"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={!configured || loading}
              className="min-w-0 flex-1 bg-transparent px-2 py-3 outline-none disabled:cursor-not-allowed"
              placeholder="Enter admin key"
              required
              minLength={8}
              maxLength={200}
            />
          </div>
          </>}
          {mfa && <div>
            {secret && <div className="mb-4 rounded-xl bg-amber-50 p-4"><p>Add this secret to your authenticator app, then enter its six-digit code.</p><code className="mt-2 block break-all select-all">{secret}</code></div>}
            <label htmlFor="mfa-code" className="text-sm font-bold">Authenticator code</label>
            <input id="mfa-code" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)} className="mt-2 w-full rounded-xl border p-4" />
          </div>}
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-brand" />
            Stay signed in for 30 days
          </label>
          {error && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={!configured || loading}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white transition hover:bg-[#e97800] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <LoaderCircle className="animate-spin" size={19} />}
            {loading ? "Checking…" : mfa ? "Verify" : "Sign in"}
          </button>
        </form>
      </section>
      </div>
    </AnimatedScene>
  );
}

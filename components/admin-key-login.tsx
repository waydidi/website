"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";

export function AdminKeyLogin({ configured }: { configured: boolean }) {
  const [key, setKey] = useState("");
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
        body: JSON.stringify({ key }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(result?.error ?? "The admin key is incorrect.");
        setKey("");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-[#1f1726]">
      <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <span className="grid size-14 place-items-center rounded-full bg-[#FFF0DE] text-[#D96F00]">
          <ShieldCheck size={28} />
        </span>
        <h1 className="mt-6 text-3xl font-black tracking-[-.03em]">Waydidi admin</h1>
        <p className="mt-2 text-slate-600">
          {configured ? "Enter your admin key to continue." : "Admin-key access has not been configured yet."}
        </p>
        <form className="mt-7" onSubmit={submit}>
          <label className="text-sm font-bold" htmlFor="admin-key">Admin key</label>
          <div className="mt-2 flex items-center rounded-2xl border border-slate-300 bg-slate-50 px-4 focus-within:border-[#FF8A05] focus-within:ring-2 focus-within:ring-[#FF8A05]/20">
            <KeyRound className="shrink-0 text-slate-400" size={20} />
            <input
              id="admin-key"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={!configured || loading}
              className="min-w-0 flex-1 bg-transparent px-3 py-4 outline-none disabled:cursor-not-allowed"
              placeholder="Enter admin key"
              required
              minLength={16}
              maxLength={200}
            />
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={!configured || loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-5 py-4 font-black text-white transition hover:bg-[#e97800] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <LoaderCircle className="animate-spin" size={19} />}
            {loading ? "Checking…" : "Access dashboard"}
          </button>
        </form>
      </section>
    </main>
  );
}

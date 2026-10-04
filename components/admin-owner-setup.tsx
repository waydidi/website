"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

const input = "w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 outline-none focus:border-[#FF8A05] focus:ring-2 focus:ring-[#FF8A05]/20";

async function post(body: unknown) {
  const res = await fetch("/api/admin-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
}

/** Request the setup email (on the sign-in page) or, from the emailed link, choose the owner's ID and password. */
export function AdminOwnerSetup({ mode }: { mode: "request" | "create" }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });

  async function run(event: FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "create" && form.password !== form.confirm) { setError("The passwords don't match."); return; }
    setState("busy");
    try {
      await post(mode === "request" ? { action: "send" } : { token: window.location.hash.slice(1), username: form.username, password: form.password });
      setState("done");
    } catch (e) { setError((e as Error).message); setState("idle"); }
  }

  if (mode === "request") return <form onSubmit={run} className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-600">
    {state === "done" ? <p>Setup link sent to the business email. It works for 30 minutes.</p> : <>
      <p>No admin account yet? Send a one-time setup link to the business email.</p>
      <button disabled={state === "busy"} className="mt-3 font-bold text-[#C96100] underline-offset-4 hover:underline disabled:opacity-60">{state === "busy" ? "Sending…" : "Send setup link"}</button></>}
    {error && <p className="mt-2 text-red-600">{error}</p>}
  </form>;

  return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-[#1f1726]">
    <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
      <span className="grid size-14 place-items-center rounded-full bg-[#FFF0DE] text-[#D96F00]"><ShieldCheck size={28} /></span>
      <h1 className="mt-6 text-3xl font-black tracking-[-.03em]">Set up admin account</h1>
      {state === "done" ? <>
        <p className="mt-3 text-slate-600">Your owner account is ready. Sign in and scan the code with an authenticator app to finish.</p>
        <Link href="/admin" className="mt-6 inline-flex rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white">Go to sign in</Link>
      </> : <form onSubmit={run} className="mt-6 grid gap-4">
        <label className="grid gap-2 text-sm font-bold">Admin ID<input className={input} autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={60} pattern="[a-zA-Z0-9._\-]+" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold">Password<input className={input} type="password" autoComplete="new-password" required minLength={12} maxLength={200} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><span className="font-normal text-slate-500">At least 12 characters.</span></label>
        <label className="grid gap-2 text-sm font-bold">Repeat password<input className={input} type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>
        <button disabled={state === "busy"} className="rounded-full bg-[#FF8A05] py-4 font-black text-white disabled:opacity-60">{state === "busy" ? "Creating…" : "Create owner account"}</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>}
    </section>
  </main>;
}

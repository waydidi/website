"use client";

import { useCallback, useEffect, useState } from "react";

type State = { on: boolean; updatedBy: string | null; updatedAt: string | null };
// The card always shows: the switch for the owner, otherwise why it can't be used, so it never silently disappears.
type Load = { kind: "loading" } | { kind: "ready"; state: State } | { kind: "owner_only" } | { kind: "failed" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** On/off switch for maintenance mode. Takes effect for visitors within about 20 seconds. */
export function MaintenanceToggle() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const r = await fetch("/api/admin/maintenance", { cache: "no-store" });
      if (r.status === 403) { setLoad({ kind: "owner_only" }); return; }
      if (!r.ok) throw new Error(String(r.status));
      setLoad({ kind: "ready", state: await r.json() as State });
    } catch { setLoad({ kind: "failed" }); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void refresh(), 0); return () => clearTimeout(t); }, [refresh]);
  async function flip(state: State) {
    const on = !state.on;
    if (on && !window.confirm("Turn on maintenance mode? Visitors will see the maintenance page instead of the website. You (signed in) still see the site.")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
      if (r.status === 403) { setLoad({ kind: "owner_only" }); return; }
      if (!r.ok) { setMsg("Couldn't change it. Please try again."); return; }
      setLoad({ kind: "ready", state: await r.json() as State });
      setMsg(on ? "Maintenance mode is on. Visitors see the maintenance page within about 20 seconds." : "The website is open to visitors again.");
    } catch { setMsg("Couldn't change it. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  const state = load.kind === "ready" ? load.state : null;
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-busy={load.kind === "loading"}>
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-[16px] font-bold">Maintenance mode{state?.on && <span className="ml-2 rounded-md bg-brand px-2 py-0.5 align-middle text-[12px] font-semibold text-white">On</span>}</h2>
        <p className="mt-1 text-[14px] text-slate-600">Visitors see a &quot;We&apos;ll be right back&quot; page. Signed-in staff, admin, driver links and customers&apos; ride and payment links keep working. <a href="/maintenance" target="_blank" className="font-semibold text-brand-darker hover:underline">Preview</a></p>
        {state?.updatedAt && <p className="mt-1 text-[12px] text-slate-500">Last changed {when(state.updatedAt)}{state.updatedBy ? ` by ${state.updatedBy}` : ""}</p>}
      </div>
      {state && <button type="button" role="switch" aria-checked={state.on} aria-label="Maintenance mode" disabled={busy} onClick={() => void flip(state)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${state.on ? "bg-brand" : "bg-slate-300"} disabled:opacity-60`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition ${state.on ? "left-[22px]" : "left-0.5"}`} />
      </button>}
    </div>
    {load.kind === "loading" && <p className="mt-2 text-[13px] text-slate-500">Loading…</p>}
    {load.kind === "owner_only" && <p className="mt-2 text-[13px] font-semibold text-slate-700">Only the owner can turn maintenance mode on or off.</p>}
    {load.kind === "failed" && <p role="alert" className="mt-2 text-[13px] font-semibold text-red-700">Couldn&apos;t load the current setting. <button type="button" onClick={() => void refresh()} className="underline">Try again</button></p>}
    {msg && <p role="status" className="mt-2 text-[13px] font-semibold text-brand-darker">{msg}</p>}
  </section>;
}

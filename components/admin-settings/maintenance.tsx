"use client";

import { useEffect, useState } from "react";

/** On/off switch for maintenance mode. Takes effect for visitors within about 20 seconds. */
export function MaintenanceToggle() {
  const [state, setState] = useState<{ on: boolean; updatedBy: string | null; updatedAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/admin/maintenance", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setState(d)).catch(() => undefined); }, []);
  async function flip() {
    if (!state) return;
    const on = !state.on;
    if (on && !window.confirm("Turn on maintenance mode? Visitors will see the maintenance page instead of the website. You (signed in) still see the site.")) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
    setBusy(false);
    if (!r.ok) { setMsg("Couldn't change it. Only the owner can."); return; }
    setState({ on, updatedBy: "you", updatedAt: new Date().toISOString() });
    setMsg(on ? "Maintenance mode is on. Visitors see the maintenance page within about 20 seconds." : "The website is open to visitors again.");
  }
  if (!state) return null;
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="text-[16px] font-bold">Maintenance mode</h2><p className="mt-1 text-[14px] text-slate-600">Visitors see a &quot;We&apos;ll be right back&quot; page. Signed-in staff, admin, driver links and customers&apos; ride and payment links keep working. <a href="/maintenance" target="_blank" className="font-semibold text-brand-darker hover:underline">Preview</a></p></div>
      <button type="button" role="switch" aria-checked={state.on} disabled={busy} onClick={() => void flip()} className={`relative h-7 w-12 shrink-0 rounded-full transition ${state.on ? "bg-brand" : "bg-slate-300"} disabled:opacity-60`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition ${state.on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
    {msg && <p role="status" className="mt-2 text-[13px] font-semibold text-brand-darker">{msg}</p>}
  </section>;
}

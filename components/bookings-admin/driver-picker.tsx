"use client";

import { Check, ChevronDown, LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type PickerDriver = { id: string; name: string; phone: string; email: string | null; area: string; vehicle: string };

// Driver column: shows the assigned driver; opens a searchable list to assign or change.
export function DriverPicker({ reference, drivers, current, canAssign }: { reference: string; drivers: PickerDriver[]; current: string | null; canAssign: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const chosen = drivers.find((d) => d.id === current);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const q = query.trim().toLowerCase();
  const list = q ? drivers.filter((d) => [d.name, d.phone, d.email ?? "", d.area, d.vehicle].some((v) => v.toLowerCase().includes(q))) : drivers;

  async function assign(driverId: string) {
    if (driverId === current) { setOpen(false); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", bookingReference: reference, driverId }) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "The driver could not be assigned.");
      setOpen(false); setQuery("");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "The driver could not be assigned."); }
    finally { setBusy(false); }
  }

  if (!canAssign) return <span className="text-slate-400">{chosen?.name ?? "N/A"}</span>;
  return <div ref={box} className="relative w-40">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} className={`flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[13px] ${chosen ? "border-slate-200 bg-white text-slate-900" : "border-dashed border-red-300 bg-red-50/60 text-red-700"}`}>
      <span className="truncate">{busy ? "Saving…" : chosen?.name ?? "Choose driver"}</span>
      {busy ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="shrink-0 text-slate-400" />}
    </button>
    {open && <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 focus-within:border-[#FF8A05]">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email, area, car" aria-label="Search drivers" className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
      </label>
      <ul role="listbox" className="mt-1.5 max-h-64 overflow-y-auto">
        {list.length === 0 && <li className="px-2.5 py-3 text-center text-[13px] text-slate-500">{drivers.length ? "No driver matches." : "No active drivers yet."}</li>}
        {list.map((d) => <li key={d.id}>
          <button type="button" role="option" aria-selected={d.id === current} disabled={busy} onClick={() => assign(d.id)} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-slate-900">{d.name}</span><span className="block truncate text-[12px] text-slate-500">{[d.phone, d.area, d.vehicle].filter(Boolean).join(" · ")}</span></span>
            {d.id === current && <Check size={15} className="mt-0.5 shrink-0 text-[#FF8A05]" />}
          </button>
        </li>)}
      </ul>
      {error && <p role="alert" className="px-2.5 pt-1 text-[12px] font-semibold text-red-600">{error}</p>}
    </div>}
  </div>;
}

"use client";

import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";

export type PickerDriver = { id: string; name: string; phone: string; email: string | null; area: string; vehicle: string; plate?: string | null; vehicleType?: string | null; hasPhoto?: boolean };

const TYPE: Record<string, string> = { sedan: "Sedan", suv: "SUV", minivan: "Minivan", van: "Minivan" };

// "Narubordee Naowarat" → "Narubordee N."
export const shortName = (name: string) => { const [first, ...rest] = name.trim().split(/\s+/); const last = rest.at(-1); return last ? `${first} ${last[0].toUpperCase()}.` : first ?? ""; };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

// Driver column: shows the assigned driver; opens a bottom sheet with a searchable list to assign or change.
export function DriverPicker({ reference, leg = "outbound", drivers, current, canAssign, onAssigned, wide, onAddDriver }: { reference: string; leg?: "outbound" | "return"; drivers: PickerDriver[]; current: string | null; canAssign: boolean; wide?: boolean; onAddDriver?: () => void; onAssigned?: (driverUrl?: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const chosen = drivers.find((d) => d.id === current);

  const q = query.trim().toLowerCase();
  const list = q ? drivers.filter((d) => [d.name, d.phone, d.email ?? "", d.area, d.vehicle, d.plate ?? ""].some((v) => v.toLowerCase().includes(q))) : drivers;

  async function assign(driverId: string) {
    if (driverId === current) { setOpen(false); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", bookingReference: reference, leg, driverId }) });
      const out = await res.json().catch(() => ({})) as { error?: string; driverUrl?: string };
      if (!res.ok) throw new Error(out.error ?? "The driver could not be assigned.");
      setOpen(false); setQuery("");
      if (onAssigned) onAssigned(out.driverUrl); else router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "The driver could not be assigned."); }
    finally { setBusy(false); }
  }

  if (!canAssign) return <span className="text-slate-400">{chosen ? shortName(chosen.name) : "N/A"}</span>;
  return <div ref={box} className={`relative min-w-0 max-w-full ${wide ? "w-full" : "w-40"}`}>
    <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-[13px] text-slate-900">
      <span className="truncate">{busy ? "Saving…" : chosen ? shortName(chosen.name) : "Choose driver"}</span>
      {busy ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="shrink-0 text-slate-400" />}
    </button>
    {/* Rendered on <body> so no card or table around it can clip or shift it: a bottom sheet on
        phones, a centred popup on tablet and desktop. */}
    <Modal open={open} onClose={() => setOpen(false)} overlayClassName="z-[80] items-end p-0 bg-slate-900/40 md:items-center md:p-6" asChild>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-[24px] bg-white pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl md:max-h-[80vh] md:rounded-[24px] md:pb-3">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200 md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3"><ModalTitle className="text-[17px] font-black">Choose driver</ModalTitle>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mx-5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-brand">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, plate or phone" aria-label="Search drivers" className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        </label>
        <ul role="listbox" className="mt-2 min-h-0 flex-1 overflow-y-auto px-3">
          {list.length === 0 && <li className="px-2.5 py-6 text-center text-[14px] text-slate-500">{drivers.length ? "No driver matches." : "No active drivers yet."}</li>}
          {list.map((d) => <li key={d.id}>
            <button type="button" role="option" aria-selected={d.id === current} disabled={busy} onClick={() => assign(d.id)} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50 ${d.id === current ? "bg-orange-50" : ""}`}>
              {d.hasPhoto
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/admin/driver-images/${encodeURIComponent(d.id)}/profile`} alt="" loading="lazy" className="size-10 shrink-0 rounded-full object-cover" />
                : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-bold text-brand-darker" aria-hidden="true">{initials(d.name)}</span>}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-[15px] font-semibold text-slate-900" title={d.name}>{shortName(d.name)}</span>
                {d.vehicleType && TYPE[d.vehicleType] && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700">{TYPE[d.vehicleType]}</span>}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-slate-600">{d.plate || "No plate"}</span>
              {d.id === current && <Check size={16} className="shrink-0 text-brand" aria-label="Assigned" />}
            </button>
          </li>)}
        </ul>
        {onAddDriver && <button type="button" onClick={() => { setOpen(false); onAddDriver(); }} className="mx-5 mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-left text-[14px] font-bold text-brand-darker hover:underline">+ Add driver</button>}
        {error && <p role="alert" className="px-5 pt-2 text-[13px] font-semibold text-red-600">{error}</p>}
      </div>
    </Modal>
  </div>;
}

"use client";

import { LoaderCircle, Pencil, X } from "lucide-react";
import { FormEvent, useState } from "react";

// Profile photo and vehicle type for a driver already in the list.
export function DriverProfileButton({ driverId, driverName, vehicleType, onSaved }: { driverId: string; driverName: string; vehicleType: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/drivers/${encodeURIComponent(driverId)}`, { method: "PATCH", body: new FormData(e.currentTarget) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "The driver could not be saved.");
      setOpen(false); setPreview(""); onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "The driver could not be saved."); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Edit photo and vehicle type of ${driverName}`} title="Photo and vehicle type" className="hover:text-brand-darker"><Pencil size={18} /></button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby={`edit-${driverId}`} className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
      <form onSubmit={save} className="w-full max-w-md rounded-t-[24px] bg-white p-5 text-night sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-3"><h2 id={`edit-${driverId}`} className="text-[18px] font-black">{driverName}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mt-4 grid gap-1 text-[13px] font-semibold">Vehicle type
          <select name="vehicleType" required defaultValue={vehicleType ?? ""} className="h-11 rounded-xl border border-slate-200 px-3 text-[15px] font-normal outline-none focus:border-brand">
            <option value="" disabled>Choose</option><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="minivan">Minivan</option>
          </select></label>
        <label className="mt-3 grid gap-1 text-[13px] font-semibold">Profile photo
          <span className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview || `/api/admin/driver-images/${encodeURIComponent(driverId)}/profile`} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="size-14 shrink-0 rounded-full bg-slate-100 object-cover" />
            <input name="profilePhoto" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : ""); }} className="min-w-0 text-[13px] font-normal file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold" />
          </span></label>
        {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Save</button>
      </form>
    </div>}
  </>;
}

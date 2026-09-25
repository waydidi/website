"use client";

import { ImagePlus, LogOut, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Top-bar profile picture: tap to change the photo or sign out.
export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(() => Date.now());
  const [hasPhoto, setHasPhoto] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function upload(file: File) {
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file);
    const res = await fetch("/api/admin/avatar", { method: "POST", body }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) { setError(out?.error ?? "The photo could not be saved."); return; }
    setHasPhoto(true); setVersion(Date.now()); setOpen(false);
  }
  async function removePhoto() {
    setBusy(true);
    await fetch("/api/admin/avatar", { method: "DELETE" }).catch(() => undefined);
    setBusy(false); setHasPhoto(false); setOpen(false);
  }
  async function signOut() {
    setBusy(true);
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/admin");
  }

  return <div ref={boxRef} className="relative ml-auto shrink-0">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="grid size-10 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white text-[13px] font-bold text-[#C96100] focus-visible:ring-2 focus-visible:ring-[#FF8A05]">
      {hasPhoto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/api/admin/avatar?v=${version}`} alt="" className="size-full object-cover" onError={() => setHasPhoto(false)} />
        : "WD"}
    </button>
    {open && <div role="menu" className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-[14px] shadow-lg">
      <p className="border-b border-slate-100 px-4 py-2.5 font-semibold text-[#15161C]">Waydidi Admin</p>
      <button type="button" role="menuitem" disabled={busy} onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50"><ImagePlus size={16} />{hasPhoto ? "Change photo" : "Add photo"}</button>
      {hasPhoto && <button type="button" role="menuitem" disabled={busy} onClick={removePhoto} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50"><Trash2 size={16} />Remove photo</button>}
      <button type="button" role="menuitem" disabled={busy} onClick={signOut} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-red-600 hover:bg-slate-50"><LogOut size={16} />Sign out</button>
      {error && <p role="alert" className="px-4 pb-2.5 text-[12px] font-semibold text-red-600">{error}</p>}
    </div>}
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
  </div>;
}

"use client";

import { LogOut, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export const OPEN_SETTINGS_EVENT = "waydidi:open-settings";

// Settings as a centred card: photo, name, account details and the dark mode switch.
export function SettingsDialog({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, show);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/session", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((o: { username?: string } | null) => setUsername(o?.username ?? "")).catch(() => undefined);
    fetch("/api/admin/avatar", { method: "HEAD", cache: "no-store" }).then((r) => { setHasPhoto(r.ok); setVersion(Date.now()); }).catch(() => undefined);
  }, [open]);

  async function upload(file: File) {
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file);
    const res = await fetch("/api/admin/avatar", { method: "POST", body }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) { setError(out?.error ?? "The photo could not be saved."); return; }
    setHasPhoto(true); setVersion(Date.now());
  }
  async function signOut() {
    setBusy(true);
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/admin");
  }

  const card = "rounded-2xl border border-slate-200 bg-white px-4 py-3";
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 text-slate-900 sm:max-w-sm">
      <DialogDescription className="sr-only">Your admin account and display settings.</DialogDescription>
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative">
          <div className="grid size-28 place-items-center overflow-hidden rounded-full bg-[#FFF0DF] text-[28px] font-black text-[#C96100]">
            {hasPhoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/admin/avatar?v=${version}`} alt="" className="size-full object-cover" onError={() => setHasPhoto(false)} />
              : "WD"}
          </div>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} aria-label={hasPhoto ? "Change photo" : "Add photo"} className="absolute -right-1 top-1 grid size-9 place-items-center rounded-full bg-white text-slate-700 shadow-md hover:text-[#C96100]"><Pencil size={15} /></button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        </div>
        <DialogTitle className="mt-4 text-[22px] font-bold">Waydidi Admin</DialogTitle>
        <span className="mt-2 rounded-lg bg-emerald-50 px-3 py-1 text-[12.5px] font-semibold text-emerald-700">Administrator</span>
        {error && <p role="alert" className="mt-2 text-[12px] font-semibold text-red-600">{error}</p>}
        <Link href="/admin/settings" onClick={() => setOpen(false)} className="mt-5 inline-flex h-12 items-center rounded-2xl bg-[#FF8A05] px-8 text-[15px] font-bold text-white shadow-sm hover:bg-[#E67900]">All settings</Link>
      </div>
      <div className="mt-5 grid gap-2.5">
        <div className={card}><p className="text-[12px] text-slate-500">Admin ID</p><p className="mt-0.5 text-[15px] font-medium">{username || "…"}</p></div>
        <div className={card}><p className="text-[12px] text-slate-500">Session</p><p className="mt-0.5 text-[15px] font-medium">MFA verified · expires after 8 hours or 30 minutes idle</p></div>
        <div className={`${card} flex items-center justify-between`}>
          <div><p className="text-[12px] text-slate-500">Appearance</p><p className="mt-0.5 text-[15px] font-medium">Dark mode</p></div>
          <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={onToggleDark} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${dark ? "bg-[#FF8A05]" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${dark ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={signOut} className="mx-auto mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-red-600 hover:underline"><LogOut size={15} />Sign out</button>
    </DialogContent>
  </Dialog>;
}

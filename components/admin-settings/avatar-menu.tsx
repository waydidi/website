"use client";

import { ImagePlus, LogOut, Settings, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";

// Top-bar profile picture: tap to change the photo or sign out.
export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(() => Date.now());
  const [hasPhoto, setHasPhoto] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Only show the <img> once we know a photo exists (no broken-image flash).
  useEffect(() => {
    fetch("/api/admin/avatar", { method: "HEAD", cache: "no-store" }).then((r) => setHasPhoto(r.ok)).catch(() => undefined);
  }, []);

  async function upload(file: File) {
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file);
    const res = await fetch("/api/admin/avatar", { method: "POST", body }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) { setError(out?.error ?? "The photo could not be saved."); setOpen(true); return; }
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

  return <div className="relative shrink-0">
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
    <DropdownMenu.Trigger aria-label="Account menu" className="grid size-10 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white text-[13px] font-bold text-brand-darker outline-none focus-visible:ring-2 focus-visible:ring-brand">
      {hasPhoto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/api/admin/avatar?v=${version}`} alt="" className="size-full object-cover" onError={() => setHasPhoto(false)} />
        : "WD"}
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
    <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-[14px] shadow-lg">
      <DropdownMenu.Label className="border-b border-slate-100 px-4 py-2.5 font-semibold text-night">Waydidi Admin</DropdownMenu.Label>
      <DropdownMenu.Item disabled={busy} onSelect={(e) => { e.preventDefault(); fileRef.current?.click(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-slate-700 outline-none data-[highlighted]:bg-slate-50 data-[disabled]:opacity-60"><ImagePlus size={16} />{hasPhoto ? "Change photo" : "Add photo"}</DropdownMenu.Item>
      {hasPhoto && <DropdownMenu.Item disabled={busy} onSelect={(e) => { e.preventDefault(); void removePhoto(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-slate-700 outline-none data-[highlighted]:bg-slate-50 data-[disabled]:opacity-60"><Trash2 size={16} />Remove photo</DropdownMenu.Item>}
      <DropdownMenu.Item onSelect={() => window.dispatchEvent(new Event("waydidi:open-settings"))} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-slate-700 outline-none data-[highlighted]:bg-slate-50 data-[disabled]:opacity-60 border-t border-slate-100"><Settings size={16} />Settings</DropdownMenu.Item>
      <DropdownMenu.Item disabled={busy} onSelect={(e) => { e.preventDefault(); void signOut(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-red-600 outline-none data-[highlighted]:bg-slate-50 data-[disabled]:opacity-60 border-t border-slate-100"><LogOut size={16} />Sign out</DropdownMenu.Item>
      {error && <p role="alert" className="px-4 pb-2.5 text-[12px] font-semibold text-red-600">{error}</p>}
    </DropdownMenu.Content>
    </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
  </div>;
}

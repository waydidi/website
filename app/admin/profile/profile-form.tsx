"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle } from "lucide-react";
import { SignOutButton } from "@/components/admin-settings/sign-out";

export function ProfileForm({ displayName, email, username, role }: { displayName: string; email: string; username: string; role: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(displayName);
  const [contactEmail, setContactEmail] = useState(email);
  const [photo, setPhoto] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/avatar", { method: "HEAD", cache: "no-store" }).then(r => setPhoto(r.ok)).catch(() => setPhoto(false)); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, email: contactEmail }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your profile could not be saved.");
      setMessage("Profile saved."); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Your profile could not be saved."); }
    finally { setBusy(false); }
  }
  async function updatePhoto(file?: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const body = new FormData(); if (file) body.append("file", file);
      const response = await fetch("/api/admin/avatar", file ? { method: "POST", body } : { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your photo could not be updated.");
      setPhoto(Boolean(file)); setVersion(Date.now()); setMessage(file ? "Photo saved." : "Photo removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Your photo could not be updated."); }
    finally { setBusy(false); }
  }
  const field = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:border-brand";
  return <div className="grid max-w-[760px] gap-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-[18px] font-semibold">Your profile</h2>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-orange-50 text-2xl font-bold text-brand-darker">
          {photo ? <img src={`/api/admin/avatar?v=${version}`} alt="Your profile photo" className="size-full object-cover" onError={() => setPhoto(false)} /> : name.trim().slice(0, 2).toUpperCase()}
        </div>
        <div><button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50"><Camera size={16} />{photo ? "Change photo" : "Add photo"}</button>
          {photo && <button type="button" disabled={busy} onClick={() => void updatePhoto()} className="ml-3 text-sm text-red-600 disabled:opacity-50">Remove</button>}
          <p className="mt-2 text-xs text-slate-500">JPG, PNG or WebP · up to 2 MB</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void updatePhoto(file); }} />
        </div>
      </div>
      <form onSubmit={save} className="mt-6 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">Display name<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={field} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Contact email<input required type="email" maxLength={254} autoComplete="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={field} /><span className="text-xs font-normal text-slate-500">Use your staff ID to sign in.</span></label>
        <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Staff ID</p><p className="mt-1 text-sm font-medium">{username}</p></div><div><p className="text-xs text-slate-500">Role</p><p className="mt-1 text-sm font-medium capitalize">{role}</p></div></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50 sm:justify-self-start">{busy && <LoaderCircle size={16} className="animate-spin" />}Save changes</button>
      </form>
    </section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div><h2 className="font-semibold">Sign out</h2><p className="mt-1 text-sm text-slate-500">End your session on this device.</p></div><SignOutButton /></section>
  </div>;
}

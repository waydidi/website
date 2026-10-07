"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Users tab: add a booking (by reference) to this member's account.
export function AddBookingButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(move = false) {
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, move }) });
      const out = await res.json().catch(() => ({})) as { error?: string; needsMove?: boolean; already?: boolean; reference?: string };
      if (res.status === 409 && out.needsMove) { if (window.confirm(out.error)) return void await add(true); setNote({ ok: false, text: "Not moved." }); return; }
      if (!res.ok) { setNote({ ok: false, text: out.error ?? "That didn't work." }); return; }
      setNote({ ok: true, text: out.already ? `${out.reference} is already in this account.` : `${out.reference} added to ${email}.` });
      setReference(""); router.refresh();
    } finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void add(); };

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="whitespace-nowrap text-[14px] font-semibold text-brand-darker hover:underline">Add booking</button>;
  return <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
    <label className="sr-only" htmlFor={`add-${id}`}>Booking reference for {email}</label>
    <input id={`add-${id}`} autoFocus required value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="Reference" maxLength={20} className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-[14px] uppercase" />
    <button disabled={busy} className="h-9 rounded-lg bg-brand px-3 text-[14px] font-semibold text-white disabled:opacity-60">{busy ? "Adding…" : "Add"}</button>
    <button type="button" onClick={() => { setOpen(false); setNote(null); }} className="text-[14px] text-slate-500">Cancel</button>
    {note && <span role={note.ok ? "status" : "alert"} className={`w-full text-[13px] ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>}
  </form>;
}

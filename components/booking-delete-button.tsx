"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArchiveRestore, Eye, EyeOff, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function BookingDeleteButton({ reference, binned = false, purgeAfter }: { reference: string; binned?: boolean; purgeAfter?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  async function request(action: "bin" | "restore") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(reference)}`, action === "bin" ? { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Booking could not be ${action === "bin" ? "moved" : "restored"}.`);
      setOpen(false); setPassword(""); setBusy(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Booking could not be updated.");
      setBusy(false);
    }
  }

  if (binned) return <div><button disabled={busy} onClick={()=>void request("restore")} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><ArchiveRestore size={14}/>{busy ? "Restoring…" : "Restore"}</button>{purgeAfter&&<p className="mt-2 max-w-40 text-xs text-slate-500">Deletes automatically {new Date(purgeAfter).toLocaleDateString("en-GB",{timeZone:"Asia/Bangkok"})}</p>}{error&&<p className="mt-2 max-w-44 text-xs font-semibold text-red-700">{error}</p>}</div>;

  return <div>
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setPassword(""); setError(""); } }}>
      <AlertDialogTrigger aria-label={`Delete booking ${reference}`} title="Delete booking" className="inline-flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={17}/></AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={(event) => { event.preventDefault(); if (password) void request("bin"); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking {reference}?</AlertDialogTitle>
            <AlertDialogDescription>It moves to the Bin for 30 days, where you can restore it. After 30 days it is deleted permanently. Enter the admin password to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          {/* A text field masked with CSS, so browsers don't offer saved passwords or passkeys here; the eye shows what was typed. */}
          <div className="relative mt-4">
            <input type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-1p-ignore data-lpignore="true" data-form-type="other"
              autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" aria-label="Admin password"
              style={show ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
              className="h-11 w-full rounded-xl border border-slate-200 pl-3 pr-11 text-[15px] outline-none focus:border-[#FF8A05]" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
          <AlertDialogFooter className="mt-5">
            <AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel>
            <button type="submit" disabled={busy || !password} className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? "Deleting…" : "Delete booking"}</button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

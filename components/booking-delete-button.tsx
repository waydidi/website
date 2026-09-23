"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
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

  async function request(action: "bin" | "restore") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(reference)}`, action === "bin" ? { method: "DELETE" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Booking could not be ${action === "bin" ? "moved" : "restored"}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Booking could not be updated.");
      setBusy(false);
    }
  }

  if (binned) return <div><button disabled={busy} onClick={()=>void request("restore")} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><ArchiveRestore size={14}/>{busy ? "Restoring…" : "Restore"}</button>{purgeAfter&&<p className="mt-2 max-w-40 text-xs text-slate-500">Deletes automatically {new Date(purgeAfter).toLocaleDateString("en-GB",{timeZone:"Asia/Bangkok"})}</p>}{error&&<p className="mt-2 max-w-44 text-xs font-semibold text-red-700">{error}</p>}</div>;

  return <div>
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 px-3 py-2 text-xs font-bold text-[#B85D00] hover:bg-orange-50"><Trash2 size={14}/>Move to bin</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move booking {reference} to bin?</AlertDialogTitle>
          <AlertDialogDescription>The booking will be hidden from operations and kept in the bin for 30 days. You can restore it during that time; afterward its linked records and evidence are deleted automatically.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep booking</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void request("bin"); }} className="bg-[#FF8A05] text-white hover:bg-[#e97800]">{busy ? "Moving…" : "Move to bin"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {error && <p className="mt-2 max-w-44 text-xs font-semibold text-red-700">{error}</p>}
  </div>;
}

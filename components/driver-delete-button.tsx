"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function DriverDeleteButton({ driverId, driverName, onDeleted }: { driverId: string; driverName: string; onDeleted: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/drivers/${encodeURIComponent(driverId)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Driver could not be deleted.");
      await onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Driver could not be deleted.");
      setBusy(false);
    }
  }
  return <div className="text-right"><AlertDialog><AlertDialogTrigger className="grid size-8 place-items-center rounded-full border border-red-200 text-red-700 hover:bg-red-50" aria-label={`Delete ${driverName}`}><Trash2 size={14}/></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {driverName}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the driver and both verification images. Drivers with journey history cannot be deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep driver</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event)=>{event.preventDefault();void remove();}} className="bg-red-600 text-white hover:bg-red-700">{busy?"Deleting…":"Delete driver"}</AlertDialogAction></AlertDialogFooter>{error&&<p className="text-sm font-semibold text-red-700">{error}</p>}</AlertDialogContent></AlertDialog></div>;
}

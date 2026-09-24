"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function UserDeleteButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) { setError(result.error ?? "User could not be deleted."); setBusy(false); return; }
    router.refresh();
  }

  return <div>
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} />Delete</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {email}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the member&apos;s account, profile, linked Google/Apple/LINE/Facebook sign-ins, saved places, travellers and sessions, and signs them out everywhere. Their bookings are kept for accounting and can still be managed with the booking reference. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep user</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }} className="bg-red-600 text-white hover:bg-red-700">{busy ? "Deleting…" : "Delete user"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {error && <p className="mt-2 max-w-44 text-xs font-semibold text-red-700">{error}</p>}
  </div>;
}

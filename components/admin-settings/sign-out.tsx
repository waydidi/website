"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined); window.location.assign("/admin"); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-medium hover:border-red-300 hover:text-red-700 disabled:opacity-50"><LogOut size={16} />{busy ? "Signing out…" : "Sign out"}</button>;
}

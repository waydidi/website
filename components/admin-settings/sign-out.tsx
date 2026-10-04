"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const response = await fetch("/api/admin/session", { method: "DELETE" }); if (!response.ok) throw new Error(); window.location.assign("/admin"); } catch { setError("Could not sign out. Please try again."); setBusy(false); } }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-medium hover:border-red-300 hover:text-red-700 disabled:opacity-50"><LogOut size={16} />{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}</div>;
}

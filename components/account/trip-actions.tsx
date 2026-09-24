"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Download, Headphones, RotateCcw } from "lucide-react";

export function TripActions({ reference, canManage, hasReceipt }: { reference: string; canManage: boolean; hasReceipt: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function manage() {
    setLoading(true); setError("");
    const response = await fetch(`/api/account/trips/${reference}/manage`, { method: "POST" });
    if (response.ok) return window.location.assign("/booking/manage");
    setLoading(false);
    setError(response.status === 401 ? "Your session expired. Please sign in again." : "We could not open this booking. Please try again.");
  }
  const secondary = "flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 font-black transition hover:border-[#FF8A05]";
  return <div className="grid gap-3">
    {canManage ? <button onClick={manage} disabled={loading} className="flex items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-5 py-3.5 font-black text-white disabled:opacity-60"><CalendarClock size={19} />{loading ? "Opening…" : "Manage this trip"}</button> : null}
    {hasReceipt ? <a href={`/api/account/trips/${reference}/pdf`} className={secondary}><Download size={19} />Download receipt (PDF)</a> : null}
    <Link href="/#booking-search" className={secondary}><RotateCcw size={19} />Book again</Link>
    <Link href="/contact" className={secondary}><Headphones size={19} />Contact support</Link>
    {error ? <p role="alert" className="text-sm font-bold text-red-600">{error}</p> : null}
  </div>;
}

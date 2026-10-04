"use client";

import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, btnPrimary } from "./ui";

type Row = { id: string; ref: string; title: string; tripDate: string | null; total: number; percent: number; commission: number; paidAt: string | null; bookingReference: string | null };
type Agency = { id: string; name: string; email: string; owed: number; paid: number; trips: Row[] };
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export function Commissions() {
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => setAgencies((await api<{ agencies: Agency[] }>("/api/admin/trips/commissions", "GET")).agencies), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);
  async function mark(ids: string[], paid: boolean, key: string) {
    setBusy(key); setError("");
    try { await api("/api/admin/trips/commissions", "POST", { tripIds: ids, paid }); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  const owed = (agencies ?? []).reduce((s, a) => s + a.owed, 0);
  return <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8">
    <h1 className="sr-only">Agency commissions</h1>
    <p className="max-w-2xl text-[14px] text-slate-500">Commission earned by travel agencies on day trips their guests paid for. Pay the agency, then mark the trips paid; the agency sees the same figures in their portal.</p>
    <p className="mt-3 text-[22px] font-bold">Owed now: {thb(owed)}</p>
    {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>}
    {agencies === null && <LoaderCircle className="mx-auto mt-12 animate-spin text-slate-400" />}
    {agencies?.length === 0 && <p className="mt-12 text-center text-slate-500">No paid agency trips yet.</p>}
    <div className="mt-5 grid gap-4">
      {agencies?.map((a) => { const unpaid = a.trips.filter((t) => !t.paidAt); return <section key={a.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div><h2 className="text-[18px] font-bold">{a.name}</h2><p className="text-[13px] text-slate-500">{a.email} · owed {thb(a.owed)} · paid {thb(a.paid)}</p></div>
          {unpaid.length > 0 && <button type="button" disabled={Boolean(busy)} onClick={() => { if (confirm(`Mark ${unpaid.length} trip(s), ${thb(a.owed)}, as paid to ${a.name}?`)) void mark(unpaid.map((t) => t.id), true, a.id); }} className={btnPrimary}>{busy === a.id ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}Mark all paid</button>}
        </header>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>{["Trip", "Date", "Trip total", "Rate", "Commission", "Status"].map((h) => <th key={h} className="h-11 px-4 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{a.trips.map((t) => <tr key={t.id}>
            <td className="px-4 py-3"><Link href={`/admin/trips/${t.id}`} className="font-semibold hover:underline">{t.title}</Link><p className="text-[12px] text-slate-500">{t.ref}{t.bookingReference ? ` · booking ${t.bookingReference}` : ""}</p></td>
            <td className="whitespace-nowrap px-4 py-3">{day(t.tripDate)}</td><td className="px-4 py-3">{thb(t.total)}</td><td className="px-4 py-3">{t.percent}%</td><td className="px-4 py-3 font-semibold">{thb(t.commission)}</td>
            <td className="px-4 py-3">{t.paidAt ? <button type="button" onClick={() => void mark([t.id], false, t.id)} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-800" title="Click to undo">Paid {new Date(t.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</button>
              : <button type="button" disabled={Boolean(busy)} onClick={() => void mark([t.id], true, t.id)} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-semibold text-amber-800 hover:bg-amber-200">{busy === t.id ? "…" : "Owed · mark paid"}</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>; })}
    </div>
  </main>;
}

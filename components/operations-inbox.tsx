"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InboxItem, InboxKind } from "@/lib/operations-inbox";

type Inbox = { items: InboxItem[]; hasMore: boolean };
export function OperationsInbox() {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState("all");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState("");
  const [resolution, setResolution] = useState<InboxItem | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ kind, offset: String(offset) });
        const response = await fetch(`/api/admin/operations/inbox?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("INBOX_UNAVAILABLE");
        const next = await response.json() as Inbox;
        if (!controller.signal.aborted) setData(next);
      } catch {
        if (!controller.signal.aborted) setError("Could not refresh the inbox. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision, kind, offset]);

  async function updateAlert(item: InboxItem, action: "acknowledge" | "resolve") {
    setBusy(item.id); setError("");
    try {
      const response = await fetch("/api/admin/operations/inbox", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id.slice("alert:".length), action, expectedStatus: item.status, note: action === "resolve" ? note : "" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The alert could not be updated.");
      setResolution(null); setNote(""); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The alert could not be updated."); }
    finally { setBusy(""); }
  }

  const items = (data?.items ?? []).filter(item => kind === "all" || item.kind === kind);
  return <section aria-labelledby="operations-inbox-title" className="mx-auto my-6 max-w-[1600px] rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 id="operations-inbox-title" className="text-xl font-black">Exception inbox</h2>
        <p className="mt-1 text-sm text-slate-500">Open alerts, journey exceptions and failed booking notifications.</p>
      </div>
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    <label className="mt-4 flex items-center gap-3 text-sm font-bold">
      Show
      <select value={kind} onChange={event => { setKind(event.target.value as InboxKind); setOffset(0); setData(null); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2">
        <option value="all">All exceptions</option>
        <option value="alert">Operations alerts</option>
        <option value="journey">Journey exceptions</option>
        <option value="delivery">Failed notifications</option>
      </select>
    </label>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}{data ? " Previously loaded items are shown below." : ""}</p>}
    <div aria-live="polite" aria-busy={loading}>
      {!data && loading && <p className="py-6 text-sm text-slate-500">Loading exceptions…</p>}
      {data && items.length === 0 && <p className="py-6 text-sm text-slate-500">No exceptions in this view.</p>}
      <ul className="mt-4 divide-y divide-slate-100">
        {items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <span className={item.severity === "critical" ? "text-xs font-black text-red-700" : "text-xs font-black text-amber-800"}>
              {item.severity === "critical" ? "Critical" : "Needs attention"}
            </span>
            <p className="mt-1 font-bold">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{item.reference} · {new Date(item.occurredAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} Bangkok</p>
            {item.acknowledgedBy && <p className="mt-1 text-xs text-slate-500">Acknowledged by {item.acknowledgedBy}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {item.kind === "alert" && <>
            {item.status === "open" && <button type="button" disabled={!!busy || loading} onClick={() => void updateAlert(item, "acknowledge")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Acknowledge</button>}
            <button type="button" disabled={!!busy || loading} onClick={() => { setResolution(item); setNote(""); }} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Resolve alert</button>
          </>}
          <Link href={`/admin/journeys/${encodeURIComponent(item.reference)}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold"
            aria-label={`Review ${item.title} for ${item.reference}`}>Review journey</Link>
          </div>
        </li>)}
      </ul>
      {data && <nav aria-label="Exception pages" className="mt-4 flex items-center gap-3 text-sm">
        <button type="button" disabled={offset === 0 || loading} onClick={() => { setOffset(value => Math.max(0, value - 100)); setData(null); }} className="rounded-full border px-4 py-2 disabled:opacity-50">Previous exceptions</button>
        <span>Page {offset / 100 + 1}</span>
        <button type="button" disabled={!data.hasMore || loading} onClick={() => { setOffset(value => value + 100); setData(null); }} className="rounded-full border px-4 py-2 disabled:opacity-50">Next exceptions</button>
      </nav>}
    </div>
    {resolution && <form onSubmit={event => { event.preventDefault(); void updateAlert(resolution, "resolve"); }} className="mt-4 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-bold">Resolve {resolution.title} · {resolution.reference}</h3>
      <label className="mt-3 block text-sm font-bold">Resolution note
        <textarea required minLength={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 p-3" />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={!!busy || note.trim().length < 3} className="rounded-full bg-plum px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm resolution</button>
        <button type="button" disabled={!!busy} onClick={() => setResolution(null)} className="rounded-full border px-4 py-2 text-sm font-bold">Cancel</button>
      </div>
    </form>}
  </section>;
}

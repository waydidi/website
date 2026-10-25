"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InboxItem } from "@/lib/operations-inbox";

type Inbox = { items: InboxItem[]; hasMore: boolean };
export function OperationsInbox() {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/operations/inbox", { cache: "no-store", signal: controller.signal });
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
  }, [revision]);

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
      <select value={kind} onChange={event => setKind(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2">
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
          </div>
          <Link href={`/admin/journeys/${encodeURIComponent(item.reference)}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold"
            aria-label={`Review ${item.title} for ${item.reference}`}>Review journey</Link>
        </li>)}
      </ul>
      {data?.hasMore && <p className="mt-3 text-sm text-amber-800">Showing the first 100 exceptions, with critical items first. Filters apply to these items.</p>}
    </div>
  </section>;
}

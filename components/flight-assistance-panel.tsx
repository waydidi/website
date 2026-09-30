"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Alert = {
    id: string;
    bookingReference: string;
    title: string;
    details: string;
    status: string;
    resolutionNote: string | null;
};
type Flight = {
    reference: string;
    flightNumber: string;
    pickupDate: string;
    pickupTime: string;
    status: string | null;
    arrival: string | null;
    checkedAt: string | null;
};
export function FlightAssistancePanel() {
    const [data, setData] = useState<{
        bookings: Flight[];
        alerts: Alert[];
    } | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");
    const load = useCallback(async () => { try {
        const res = await fetch("/api/admin/flights", { cache: "no-store" });
        if (!res.ok)
            throw Error("Flight assistance unavailable");
        setData(await res.json());
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
    } }, []);
    useEffect(() => {
        const first = window.setTimeout(() => { void load(); }, 0);
        const timer = window.setInterval(() => { void load(); }, 30_000);
        return () => { window.clearTimeout(first); window.clearInterval(timer); };
    }, [load]);
    async function act(payload: Record<string, unknown>, key: string) { setBusy(key); setError(""); try {
        const res = await fetch("/api/admin/flights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (!res.ok)
            throw Error(json.error);
        await load();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
    }
    finally {
        setBusy("");
    } }
    return <details className="my-4 rounded-xl border p-4"><summary className="cursor-pointer font-bold">Flight-change assistance · {data?.alerts.filter(a => a.status === "open").length ?? 0} pickups need review</summary><p className="my-3 text-sm text-slate-600">Arrival information refreshes automatically for airport pickups within 48 hours. Changes of 30 minutes, cancellations and diversions need review. Pickup times stay as booked until operations edits the outbound schedule.</p>{error && <p role="alert" className="text-red-700">{error}</p>}{data?.alerts.filter(a => a.status !== "resolved").map(a => { let details: {
        status?: string;
        arrival?: string;
        differenceMinutes?: number;
        proposedPickupAt?: string;
    } = {}; try {
        details = JSON.parse(a.details);
    }
    catch { } return <div key={a.id} className="my-3 rounded bg-amber-50 p-3"><strong>{a.bookingReference} · {a.title}</strong><p>{details.status} · Arrival {details.arrival ?? "unavailable"} · Change {details.differenceMinutes ?? "unknown"} min</p>{details.proposedPickupAt && <p>Suggested pickup: {new Date(details.proposedPickupAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} Bangkok</p>}<Link href="/admin/calendar" className="mr-4 underline">Review outbound schedule</Link><button disabled={busy === a.id} onClick={() => { const reason = window.prompt("Review note: describe the agreed pickup adjustment or why no change is needed"); if (reason)
        void act({ action: "resolve", alertId: a.id, reason }, a.id); }} className="rounded bg-white p-2">Mark reviewed</button></div>; })}<div className="space-y-2">{data?.bookings.map(b => <div key={b.reference} className="flex flex-wrap items-center gap-3 border-t pt-2 text-sm"><strong>{b.reference} · {b.flightNumber}</strong><span>{b.status ?? "Awaiting lookup"} · {b.arrival ?? "No arrival information"}</span><span>Checked {b.checkedAt ?? "never"}</span><button disabled={busy === b.reference} onClick={() => act({ action: "refresh", reference: b.reference }, b.reference)} className="rounded bg-slate-100 p-2">Refresh arrival</button></div>)}</div></details>;
}

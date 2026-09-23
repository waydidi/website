"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, Plane, RefreshCw } from "lucide-react";

type Result = { flightNumber: string; status: string; airline: string | null; departureAirport: string | null; arrivalAirport: string | null; estimatedArrival: string | null; scheduledArrival: string | null; terminal: string | null; cached: boolean };

export function FlightLookup({ flightNumber, flightDate }: { flightNumber: string; flightDate: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const currentResult = result?.flightNumber === flightNumber.toUpperCase().replace(/[^A-Z0-9]/g, "") ? result : null;
  async function check() {
    if (!flightNumber.trim()) return setError("Enter your flight number first.");
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/flights/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightNumber, flightDate }) });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Flight status is unavailable.");
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Flight status is unavailable."); }
    finally { setLoading(false); }
  }
  return <div className="sm:col-span-2">
    <button type="button" onClick={check} disabled={loading || !flightNumber.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#FF8A05] px-4 text-sm font-black text-[#B85E00] disabled:cursor-not-allowed disabled:opacity-45">
      {loading ? <LoaderCircle className="animate-spin" size={17}/> : currentResult ? <RefreshCw size={17}/> : <Plane size={17}/>} {currentResult ? "Check again" : "Check flight"}
    </button>
    {currentResult && <div role="status" className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm">
      <p className="flex items-center gap-2 font-black text-[#7A3D00]"><CheckCircle2 size={17}/> {currentResult.airline ? `${currentResult.airline} · ` : ""}{currentResult.flightNumber} <span className="rounded-full bg-white px-2 py-1 text-xs uppercase">{currentResult.status}</span></p>
      <p className="mt-2 text-slate-700">{currentResult.departureAirport ?? "Departure"} → {currentResult.arrivalAirport ?? "Arrival"}{currentResult.terminal ? ` · Terminal ${currentResult.terminal}` : ""}</p>
      {(currentResult.estimatedArrival || currentResult.scheduledArrival) && <p className="mt-1 text-slate-600">Arrival: {new Date(currentResult.estimatedArrival ?? currentResult.scheduledArrival!).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}</p>}
    </div>}
    {error && <p role="status" className="mt-3 text-sm font-semibold text-amber-800">{error}</p>}
  </div>;
}

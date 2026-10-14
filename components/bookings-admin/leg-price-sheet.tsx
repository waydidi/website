"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { bahtToMinor } from "@/lib/leg-price-rules";

// Round trip: pop-up from the bottom with the price to collect for the first trip and for the second trip
// (some customers pay each trip separately). The two must add up to the booking's price.
export function LegPriceSheet({ reference, total, split, onClose }: { reference: string; total: number; split: { first: number; second: number } | null; onClose: () => void }) {
  const router = useRouter();
  const [first, setFirst] = useState(split ? String(split.first) : "");
  const [second, setSecond] = useState(split ? String(split.second) : "");
  const [touchedSecond, setTouchedSecond] = useState(Boolean(split));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstMinor = bahtToMinor(first), secondMinor = bahtToMinor(second), totalMinor = Math.round(total * 100);
  const left = firstMinor !== null || secondMinor !== null ? totalMinor - (firstMinor ?? 0) - (secondMinor ?? 0) : null;
  const valid = firstMinor !== null && secondMinor !== null && left === 0;
  // The second price follows the first (the rest of the total) until it is typed by hand.
  const onFirst = (value: string) => { setFirst(value); const m = bahtToMinor(value); if (!touchedSecond) setSecond(m !== null && m < totalMinor ? String((totalMinor - m) / 100) : ""); };
  async function save() {
    if (!valid || busy) return;
    setBusy(true); setError("");
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(reference)}/leg-prices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ first, second }) }).catch(() => null);
    if (res?.ok) { onClose(); router.refresh(); return; }
    const data = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setError(data?.error ?? "Couldn't save. Try again."); setBusy(false);
  }
  const field = "mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[16px] font-semibold text-night outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
  return <Modal open onClose={onClose} locked={busy} sheet className="max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-5 text-night sm:max-w-md sm:rounded-3xl">
    <ModalTitle className="text-[19px] font-black">Split payment · {reference}</ModalTitle>
    <p className="mt-1 text-[14px] text-slate-600">Booking price THB {total.toLocaleString("en-US")}. Enter what the customer pays for each trip.</p>
    <div className="mt-4 grid gap-4">
      <label className="block text-[14px] font-semibold text-slate-600">First trip price to collect
        <input inputMode="decimal" value={first} onChange={(e) => onFirst(e.target.value)} placeholder="THB" className={field} />
      </label>
      <label className="block text-[14px] font-semibold text-slate-600">Second trip price to collect
        <input inputMode="decimal" value={second} onChange={(e) => { setSecond(e.target.value); setTouchedSecond(true); }} placeholder="THB" className={field} />
      </label>
    </div>
    <p role="status" className={`mt-3 text-[13.5px] font-semibold ${left === 0 ? "text-emerald-700" : "text-slate-500"}`}>
      {left === null ? "The two prices must add up to the booking price." : left === 0 ? "Adds up to the booking price ✓" : left > 0 ? `THB ${(left / 100).toLocaleString("en-US")} still to share out` : `THB ${(-left / 100).toLocaleString("en-US")} over the booking price`}
    </p>
    {error && <p role="alert" className="mt-2 text-[13.5px] font-semibold text-red-700">{error}</p>}
    <div className="mt-5 flex gap-3">
      <button type="button" onClick={onClose} disabled={busy} className="h-12 flex-1 rounded-full border border-slate-300 font-bold text-slate-700 disabled:opacity-50">Cancel</button>
      <button type="button" onClick={() => void save()} disabled={!valid || busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand font-black text-white disabled:opacity-50">{busy && <LoaderCircle className="animate-spin" size={18} />}Save</button>
    </div>
  </Modal>;
}

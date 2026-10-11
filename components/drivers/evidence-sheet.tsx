"use client";
import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";

// A booking's driver evidence in a sheet from the bottom: the Stand by, Pick up and Drop photos of one
// journey. When the Drop waits for review, "Completed job" confirms it (as the Telegram button does).
type Photo = { id: string; event_type: string; leg: string; step: string | null; step_review: string | null; status_event_id: string | null; device_captured_at: string; deleted_at: string | null; expires_at: string; latitude: number | null; longitude: number | null };
const STAGES: [string, string][] = [["standby", "Stand by"], ["trip_started", "Pick up"], ["completed", "Drop"]];
const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function EvidenceSheet({ reference, leg = "outbound", onClose }: { reference: string; leg?: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/evidence?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { evidence?: Photo[]; error?: string };
    if (!res.ok) throw new Error(body.error ?? "Evidence could not be loaded.");
    setPhotos(body.evidence ?? []);
  }, [reference]);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch((e: Error) => { setError(e.message); setPhotos([]); }), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const now = new Date().toISOString();
  const mine = (photos ?? []).filter((p) => p.leg === leg && !p.deleted_at && p.expires_at > now);
  // Newest photo for each step; a Drop photo whose step wasn't sent yet still shows under Drop.
  const forStage = (step: string) => mine.find((p) => p.step === step) ?? (step === "completed" ? mine.find((p) => !p.step && p.event_type === "dropoff") : undefined);
  async function complete(eventId: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", eventId }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not complete the job.");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal open onClose={onClose} sheet overlayClassName="z-[70] bg-black/40 sm:items-end sm:p-0" asChild>
    <div className="max-h-[88dvh] w-full max-w-lg animate-in slide-in-from-bottom overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] duration-300">
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
      <div className="flex items-center justify-between">
        <ModalTitle className="text-lg font-black">Evidence · {reference}</ModalTitle>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {photos === null ? <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} /> Loading…</p> :
        <ul className="mt-3 grid gap-4">
          {STAGES.map(([step, label]) => {
            const p = forStage(step);
            const pending = step === "completed" && p?.step === "completed" && p.step_review === "pending_review" && p.status_event_id;
            const verified = step === "completed" && p?.step_review === "verified";
            return <li key={step}>
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-bold">{label}{p && !p.step && <span className="ml-2 text-xs font-semibold text-amber-700">not sent yet</span>}</p>
                {p && <p className="text-xs text-slate-500">{time(p.device_captured_at)}</p>}
              </div>
              {p
                // eslint-disable-next-line @next/next/no-img-element -- private evidence photo
                ? <a href={`/api/admin/evidence/photos/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/admin/evidence/photos/${p.id}?original=1`} alt={`${label} photo`} className="mt-1.5 aspect-[4/3] w-full rounded-2xl bg-slate-100 object-cover" /></a>
                : <div className="mt-1.5 grid aspect-[4/3] w-full place-items-center rounded-2xl bg-slate-100 text-sm text-slate-400">Not reached yet</div>}
              {p && p.latitude !== null && <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand-darker underline">📍 Where it was taken</a>}
              {pending && <button type="button" disabled={busy} onClick={() => void complete(p!.status_event_id!)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-line-green text-[15px] font-black text-white disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}Completed job</button>}
              {verified && <p className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 size={17} /> Job completed</p>}
            </li>;
          })}
        </ul>}
    </div>
  </Modal>;
}

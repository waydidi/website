"use client";
import { useEffect, useState } from "react";

// The driver's Stand by / Pick up / Drop photos for one booking, as small tappable thumbnails.
type Photo = { id: string; event_type: string; leg: string; step: string | null; device_captured_at: string; deleted_at: string | null; expires_at: string };
const STEP: Record<string, string> = { standby: "Stand by", trip_started: "Pick up", completed: "Drop" };
const label = (p: Photo) => (p.step ? STEP[p.step] ?? p.step : p.event_type === "dropoff" ? "Drop (not sent)" : "Pick up (not sent)");
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function TripPhotos({ reference, leg }: { reference: string; leg?: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/evidence?reference=${encodeURIComponent(reference)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { evidence: [] }))
      .then((b: { evidence?: Photo[] }) => { if (live) setPhotos(b.evidence ?? []); })
      .catch(() => { if (live) setPhotos([]); });
    return () => { live = false; };
  }, [reference]);
  const now = new Date().toISOString();
  // Oldest first, so they read Stand by → Pick up → Drop.
  const shown = (photos ?? []).filter((p) => !p.deleted_at && p.expires_at > now && (!leg || p.leg === leg)).reverse();
  return <div className="grid gap-1.5">
    <p className="text-slate-500">Trip photos</p>
    {photos === null ? <p className="text-slate-400">Loading…</p> : shown.length === 0 ? <p className="font-semibold">No photos yet</p> :
      <ul className="flex gap-2 overflow-x-auto pb-1">{shown.map((p) => <li key={p.id} className="w-[104px] shrink-0">
        <a href={`/api/admin/evidence/photos/${p.id}`} target="_blank" rel="noreferrer" className="block">
          <img src={`/api/admin/evidence/photos/${p.id}?original=1`} alt={`${label(p)} photo`} loading="lazy" className="aspect-[3/4] w-full rounded-xl bg-slate-200 object-cover" />
        </a>
        <p className="mt-1 text-[12px] font-bold leading-tight">{label(p)}</p>
        <p className="text-[11.5px] text-slate-500">{time(p.device_captured_at)}</p>
      </li>)}</ul>}
  </div>;
}

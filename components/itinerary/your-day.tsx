"use client";

import { Backpack, CheckCircle2, Clock, MapPin, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { RouteMap, type MapPoint } from "@/components/trip-planner/route-map";

type Stop = { id: string; name: string; plannedStart: number; projectedStart: number; projectedEnd: number; status: "done" | "current" | "upcoming" | "at_risk" | "skipped"; sessionTime: string | null };
type Live = {
  state: "not_today" | "before" | "live" | "done"; delayMin: number; current: Stop | null; next: (Stop & { etaMin: number }) | null;
  driver: { lat: number; lng: number; updatedAt: string } | null; stops: Stop[]; returnAt: number; title: string; tripDate: string | null; startTime: string; pickupText: string;
  pickup: { lat: number; lng: number } | null; packing: string[]; points: { id: string; lat: number; lng: number; name: string }[];
};
const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** "Your day": current stop, next stop with its time, and where the driver is. Refreshes every 30 seconds. */
export function YourDay({ token }: { token: string }) {
  const [live, setLive] = useState<Live | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => fetch(`/api/itinerary/${token}/live`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("unavailable")))).then((d: Live) => { if (active) { setLive(d); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    void load();
    const t = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(t); };
  }, [token]);
  if (failed && !live) return null;
  if (!live) return <section className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-slate-500">Loading your day…</p></section>;
  if (live.state === "not_today") return null;

  const points: MapPoint[] = [
    ...live.points.map((p, i) => ({ id: p.id, lat: p.lat, lng: p.lng, label: String(i + 1), title: p.name, kind: "stop" as const, muted: live.stops.find((s) => s.id === p.id)?.status === "done" })),
    ...(live.driver ? [{ id: "driver", lat: live.driver.lat, lng: live.driver.lng, label: "🚗", title: "Your driver", kind: "driver" as const }] : []),
  ];
  return <section className="overflow-hidden rounded-3xl bg-white shadow-sm" aria-live="polite">
    <div className="bg-[#211726] p-5 text-white">
      <p className="text-[13px] font-bold uppercase tracking-[.14em] text-white/70">Your day</p>
      {live.state === "before" && <><p className="mt-1 text-[20px] font-bold">Pickup today at {live.startTime}</p><p className="text-white/80">{live.pickupText}. Your driver&apos;s location shows here once they set off.</p></>}
      {live.state === "done" && <p className="mt-1 flex items-center gap-2 text-[20px] font-bold"><CheckCircle2 size={20} />Trip finished. We hope you had a wonderful day!</p>}
      {live.state === "live" && <>
        {live.current ? <p className="mt-1 text-[22px] font-bold">Now at {live.current.name}</p> : <p className="mt-1 flex items-center gap-2 text-[22px] font-bold"><Navigation size={20} />On the way{live.next ? ` to ${live.next.name}` : " back"}</p>}
        {live.current && <p className="text-white/80">Until about {hhmm(live.current.projectedEnd)}</p>}
        {live.next && <p className="mt-3 rounded-2xl bg-white/10 p-3 text-[15px]">Next: <b>{live.next.name}</b> · arriving about <b>{hhmm(live.next.etaMin)}</b>{live.next.sessionTime ? ` · session ${live.next.sessionTime}` : ""}</p>}
        <p className="mt-2 text-[13px] text-white/70">{live.delayMin >= 10 ? `Running about ${live.delayMin} min behind plan; your driver will adjust. ` : "Running to plan. "}Back around {hhmm(live.returnAt)}.</p>
      </>}
    </div>
    {live.state === "live" && points.length > 0 && <RouteMap points={points} selected={live.driver ? "driver" : null} className="h-[260px] rounded-none" />}
    <ol className="grid gap-1 p-5 text-[15px]">
      {live.stops.map((s) => <li key={s.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${s.status === "current" ? "bg-orange-50 font-bold" : ""} ${s.status === "done" || s.status === "skipped" ? "text-slate-400" : ""}`}>
        {s.status === "done" ? <CheckCircle2 size={17} className="text-emerald-600" /> : s.status === "current" ? <MapPin size={17} className="text-[#D96F00]" /> : <Clock size={17} className="text-slate-400" />}
        <span className="w-12 tabular-nums">{hhmm(s.status === "done" ? s.plannedStart : s.projectedStart)}</span>
        <span className={s.status === "skipped" ? "line-through" : ""}>{s.name}</span>
      </li>)}
    </ol>
    {live.state !== "done" && live.packing.length > 0 && <details className="border-t border-slate-100 px-5 py-4"><summary className="flex cursor-pointer items-center gap-2 font-semibold"><Backpack size={17} className="text-[#D96F00]" />What to bring</summary><ul className="mt-2 grid gap-1 text-[14px] text-slate-700">{live.packing.map((p) => <li key={p}>• {p}</li>)}</ul></details>}
  </section>;
}

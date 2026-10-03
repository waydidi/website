// Live view of a booked smart trip on the day: where the trip is now, how late
// it runs, which later stops are at risk (fixed sessions first) and what to
// skip or shorten. Pure: the caller supplies the clock and the driver position.
import { estimateDriveMinutes, schedule, toMin, type AttractionData, type Point, type TripStop } from "@/lib/trip-plan";
import type { SnapshotStop, TripSnapshot } from "@/lib/smart-trips";

export type LiveStopStatus = "done" | "current" | "upcoming" | "at_risk" | "skipped";
export type LiveStop = { id: string; name: string; plannedStart: number; plannedEnd: number; projectedStart: number; projectedEnd: number; status: LiveStopStatus; sessionTime: string | null; risk: string | null };
export type LiveSuggestion = { label: string; kind: "skip" | "shorten"; stopId: string; minutes?: number; fixes: boolean };
export type LiveStatus = {
  state: "not_today" | "before" | "live" | "done";
  delayMin: number; current: LiveStop | null; next: (LiveStop & { etaMin: number }) | null;
  driver: (Point & { updatedAt: string }) | null; stops: LiveStop[]; risks: string[]; suggestions: LiveSuggestion[]; returnAt: number;
};

const NEAR_KM = 0.35;
const km = (a: Point, b: Point) => { const R = 6371, r = (d: number) => (d * Math.PI) / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const pointOf = (s: SnapshotStop): Point | null => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);

/** Planning data rebuilt from the frozen copy, so the live view checks the same rules the customer was promised. */
function snapshotAttractions(stops: SnapshotStop[]): Record<string, AttractionData> {
  return Object.fromEntries(stops.map((s) => {
    const [open, close] = s.openHours?.split("–") ?? [null, null];
    const buffer = s.sessionTime && s.checkIn != null ? toMin(s.sessionTime) - s.checkIn : 0;
    return [s.id, { id: s.id, name: s.name, latitude: s.lat, longitude: s.lng, openTime: open ?? null, closeTime: close ?? null, lastEntry: null, closedDays: [], durationMin: s.end - s.start, arrivalBufferMin: buffer,
      programs: s.sessionTime ? [{ id: "p", name: s.program ?? s.name, durationMin: s.end - s.start, arrivalBufferMin: buffer, sessions: [{ time: s.sessionTime }] }] : [], exceptions: [], tags: [] }];
  }));
}
const asTripStop = (s: SnapshotStop, skipped: boolean, durationMin = s.end - s.start): TripStop => ({
  id: s.id, kind: s.kind, name: s.name, attractionId: s.id, programId: s.sessionTime ? "p" : undefined, sessionTime: s.sessionTime ?? undefined,
  lat: s.lat, lng: s.lng, durationMin, priority: s.sessionTime ? "fixed" : "must", skipped,
});

export function liveStatus(snap: TripSnapshot, now: Date, driver: (Point & { updatedAt: string }) | null, skippedIds: string[] = []): LiveStatus {
  const bangkok = new Date(now.getTime() + 7 * 3600_000);
  const today = bangkok.toISOString().slice(0, 10);
  const nowMin = bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes();
  const base = (status: LiveStopStatus, s: SnapshotStop): LiveStop => ({ id: s.id, name: s.name, plannedStart: s.start, plannedEnd: s.end, projectedStart: s.start, projectedEnd: s.end, status, sessionTime: s.sessionTime, risk: null });
  const empty = { delayMin: 0, current: null, next: null, driver, risks: [], suggestions: [], returnAt: snap.returnAt };
  if (snap.tripDate !== today) return { ...empty, state: "not_today", stops: snap.stops.map((s) => base(skippedIds.includes(s.id) ? "skipped" : "upcoming", s)) };
  if (nowMin >= snap.returnAt + 30) return { ...empty, state: "done", stops: snap.stops.map((s) => base(skippedIds.includes(s.id) ? "skipped" : "done", s)) };

  const active = snap.stops.filter((s) => !skippedIds.includes(s.id));
  // Where is the trip? At a stop if the driver is close to it; otherwise heading to the first stop not yet finished.
  let atIndex = -1;
  if (driver) atIndex = active.findIndex((s) => { const p = pointOf(s); return p ? km(p, driver) <= NEAR_KM : false; });
  if (atIndex >= 0 && active[atIndex].end + 60 < nowMin && atIndex < active.length - 1) atIndex = -1; // long gone, GPS jitter
  const nextIndex = atIndex >= 0 ? atIndex + 1 : Math.max(0, active.findIndex((s) => s.end > nowMin));
  const done = new Set(active.slice(0, atIndex >= 0 ? atIndex : nextIndex).map((s) => s.id));
  const started = nowMin >= toMin(snap.startTime) - 15 || Boolean(driver);
  if (!started) return { ...empty, state: "before", stops: snap.stops.map((s) => base(skippedIds.includes(s.id) ? "skipped" : "upcoming", s)) };

  // Re-time what's left from where the car is (or the current stop) and now.
  const current = atIndex >= 0 ? active[atIndex] : null;
  const leaveAt = current ? Math.max(nowMin, current.end) : nowMin;
  const from: Point | null = current ? pointOf(current) : driver ?? (nextIndex > 0 ? pointOf(active[nextIndex - 1]) : snap.pickup);
  const remaining = active.slice(nextIndex);
  const attractions = snapshotAttractions(snap.stops);
  const input = { date: snap.tripDate, startMin: leaveAt, from, end: snap.end ?? snap.pickup, endLimit: toMin(snap.startTime) + snap.durationHours * 60, attractions, travel: (a: Point, b: Point) => estimateDriveMinutes(a, b) };
  const projected = schedule(remaining.map((s) => asTripStop(s, false)), input);
  const byId = Object.fromEntries(projected.stops.map((p) => [p.id, p]));

  const stops: LiveStop[] = snap.stops.map((s) => {
    if (skippedIds.includes(s.id)) return base("skipped", s);
    if (done.has(s.id)) return base("done", s);
    if (current?.id === s.id) return { ...base("current", s), projectedEnd: leaveAt };
    const p = byId[s.id];
    const risk = p?.problems.find((x) => x.level === "error")?.message ?? null;
    return { ...base(risk ? "at_risk" : "upcoming", s), projectedStart: p?.start ?? s.start, projectedEnd: p?.end ?? s.end, risk };
  });
  const nextStop = remaining[0] ? stops.find((s) => s.id === remaining[0].id)! : null;
  const etaMin = nextStop ? (byId[nextStop.id]?.arrival ?? nextStop.projectedStart) : 0;
  const delayMin = nextStop ? Math.max(0, Math.round(etaMin - (remaining[0].start - (byId[nextStop.id]?.wait ?? 0)))) : 0;
  const risks = projected.problems.filter((p) => p.level === "error").map((p) => p.message);

  // Suggestions: skip or shorten a flexible stop before the first problem, best first.
  const suggestions: LiveSuggestion[] = [];
  if (risks.length) {
    const errors = (stopsList: TripStop[]) => schedule(stopsList, input).problems.filter((p) => p.level === "error").length;
    const baseList = remaining.map((s) => asTripStop(s, false));
    const before = errors(baseList);
    if (current && !current.sessionTime) {
      const over = Math.max(0, Math.round(current.end - nowMin));
      for (const cut of [15, 30]) if (over >= cut) {
        const input2 = { ...input, startMin: leaveAt - cut };
        const fixes = schedule(baseList, input2).problems.filter((p) => p.level === "error").length < before;
        suggestions.push({ label: `Leave ${current.name} ${cut} min early`, kind: "shorten", stopId: current.id, minutes: cut, fixes });
      }
    }
    for (const s of remaining) {
      if (s.sessionTime) continue;
      const skipped = baseList.map((x) => (x.id === s.id ? { ...x, skipped: true } : x));
      suggestions.push({ label: `Skip ${s.name}`, kind: "skip", stopId: s.id, fixes: errors(skipped) < before });
      const dur = s.end - s.start;
      if (dur >= 45) {
        const shorter = baseList.map((x) => (x.id === s.id ? { ...x, durationMin: dur - 30 } : x));
        suggestions.push({ label: `Shorten ${s.name} to ${dur - 30} min`, kind: "shorten", stopId: s.id, minutes: 30, fixes: errors(shorter) < before });
      }
    }
    suggestions.sort((a, b) => Number(b.fixes) - Number(a.fixes) || (a.kind === "shorten" ? -1 : 1));
  }
  return {
    state: "live", delayMin, current: current ? stops.find((s) => s.id === current.id)! : null,
    next: nextStop ? { ...nextStop, etaMin } : null, driver, stops, risks, suggestions: suggestions.slice(0, 4), returnAt: projected.returnAt,
  };
}

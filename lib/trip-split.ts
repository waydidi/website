// Multi-day smart trips: splits a list of places into days that each fit the day's hours. Pure (no database, no
// network), like lib/trip-plan.ts, so it runs the same on the server and in tests. The AI never decides the split:
// it only reads which places the customer wants; this code decides which day each one goes on.
import { autoArrange, closedOn, schedule, type Plan, type PlanInput, type Point, type TripStop } from "@/lib/trip-plan";

/** Most days one trip can have. */
export const MAX_TRIP_DAYS = 15;
/** Longest day the splitter plans. */
export const MAX_DAY_HOURS = 12;

export type SplitBase = Omit<PlanInput, "date" | "endLimit"> & { startDate: string | null; hours: number };
export type SplitDay = { date: string | null; stops: TripStop[]; plan: Plan; hours: number };
export type SplitResult = { days: SplitDay[]; fits: boolean };

export const dayDate = (start: string | null, offset: number) =>
  start ? new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10) : null;
const pointOf = (s: TripStop): Point | null => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);
const errors = (p: Plan) => p.problems.filter((x) => x.level === "error").length;
const movable = (s: TripStop) => !s.sessionTime && !s.locked;

/** A day fits when it ends in time, has no errors and leaves no place out. */
function judge(stops: TripStop[], base: SplitBase, date: string | null) {
  const input: PlanInput = { ...base, date, endLimit: base.startMin + base.hours * 60 };
  const arranged = stops.length ? autoArrange(stops, input) : [];
  const plan = schedule(arranged, input);
  const fits = plan.overBy === 0 && errors(plan) === 0 && arranged.every((s) => !s.skipped);
  return { stops: arranged.map((s) => ({ ...s, skipped: false })), plan, fits };
}

/** Places in a drive order that starts near the pickup and keeps nearby places together. */
function tour(stops: TripStop[], from: Point | null, travel: SplitBase["travel"]) {
  const located = stops.filter(pointOf), loose = stops.filter((s) => !pointOf(s));
  const out: TripStop[] = [];
  let at = from ?? (located[0] ? pointOf(located[0]) : null);
  const left = [...located];
  while (left.length) {
    let best = 0, bestMin = Infinity;
    left.forEach((s, i) => { const m = at ? travel(at, pointOf(s)!) : 0; if (m < bestMin) { bestMin = m; best = i; } });
    const [next] = left.splice(best, 1);
    out.push(next); at = pointOf(next);
  }
  return [...out, ...loose];
}

/** One way to put the places on `n` days: neighbouring places together, closed days avoided, then repaired. */
function attempt(stops: TripStop[], n: number, base: SplitBase, pinned: Record<string, number>) {
  const days: TripStop[][] = Array.from({ length: n }, () => []);
  const free = stops.filter((s) => pinned[s.id] === undefined);
  for (const s of stops) if (pinned[s.id] !== undefined) days[Math.min(n - 1, Math.max(0, pinned[s.id]))].push(s);
  // Cut the drive order into n runs of about the same time on site.
  const ordered = tour(free, base.from, base.travel);
  const weight = (s: TripStop) => s.durationMin + 30;
  const target = ordered.reduce((sum, s) => sum + weight(s), 0) / n;
  let day = 0, run = 0;
  for (const s of ordered) {
    while (day < n - 1 && run >= target * (day + 1) - weight(s) / 2 && days[day].length) day++;
    days[day].push(s); run += weight(s);
  }
  // A place closed on its day's date moves to the nearest day it is open.
  const dates = days.map((_, i) => dayDate(base.startDate, i));
  for (let i = 0; i < n; i++) for (const s of [...days[i]]) {
    const a = s.attractionId ? base.attractions[s.attractionId] : undefined;
    if (!a || pinned[s.id] !== undefined || !closedOn(a, dates[i])) continue;
    const open = [...Array(n).keys()].filter((j) => !closedOn(a, dates[j])).sort((x, y) => Math.abs(x - i) - Math.abs(y - i) || y - x)[0];
    if (open !== undefined) { days[i] = days[i].filter((x) => x !== s); days[open].push(s); }
  }
  // Repair: while a day does not fit, move one of its movable places to the nearest day that still fits with it.
  const judged = days.map((d, i) => judge(d, base, dates[i]));
  for (let guard = 0; guard < stops.length * n && judged.some((j) => !j.fits); guard++) {
    const i = judged.findIndex((j) => !j.fits);
    const candidates = [...days[i]].reverse().filter((s) => movable(s) && pinned[s.id] === undefined);
    let moved = false;
    for (const s of candidates) {
      const targets = [...Array(n).keys()].filter((j) => j !== i).sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
      for (const j of targets) {
        const trial = judge([...days[j], s], base, dates[j]);
        if (!trial.fits) continue;
        days[i] = days[i].filter((x) => x !== s); days[j] = [...days[j], s];
        judged[i] = judge(days[i], base, dates[i]); judged[j] = trial; moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  const out: SplitDay[] = judged.map((j, i) => ({ date: dates[i], stops: j.stops, plan: j.plan, hours: neededHours(j.plan, base) }));
  return { days: out, fits: judged.every((j) => j.fits) && out.every((d) => d.stops.length) };
}

/** Whole hours a day takes from pickup to drop-off, at least 1 and at most the day's hours. */
function neededHours(plan: Plan, base: SplitBase) {
  return Math.min(base.hours, Math.max(1, Math.ceil((plan.returnAt - base.startMin) / 60)));
}

/**
 * The places on as few days as fit (or exactly `days` when the customer chose how many). Each day is at most
 * MAX_DAY_HOURS and starts and ends at the pickup; places close together go on the same day, a place closed on a
 * date moves to another day, and `pinned` keeps a place on a chosen day (0 is the first day). When nothing fits even
 * on MAX_TRIP_DAYS days, the best attempt comes back with fits: false so staff can see what is over.
 */
export function splitIntoDays(stops: TripStop[], base: SplitBase, options: { days?: number | null; pinned?: Record<string, number> } = {}): SplitResult {
  const b = { ...base, hours: Math.min(MAX_DAY_HOURS, Math.max(1, Math.round(base.hours))) };
  const pinned = options.pinned ?? {};
  const live = stops.filter((s) => !s.skipped);
  if (options.days) return attempt(live, Math.min(MAX_TRIP_DAYS, Math.max(1, Math.round(options.days)), live.length || 1), b, pinned);
  const perDay = b.hours * 60;
  const need = live.reduce((sum, s) => sum + s.durationMin + 30, 0);
  let best: SplitResult | null = null;
  const most = Math.min(MAX_TRIP_DAYS, Math.max(1, live.length));
  for (let n = Math.min(most, Math.max(1, Math.ceil(need / perDay))); n <= most; n++) {
    const tried = attempt(live, n, b, pinned);
    if (tried.fits) return tried;
    best = tried;
  }
  return best ?? attempt(live, 1, b, pinned);
}

/**
 * Shares a whole-baht amount across days in proportion to each day's weight (option A: the day's hourly rate), so
 * the parts always add up to exactly the amount. Equal parts when no day has a weight.
 */
export function shareByWeight(amount: number, weights: number[]): number[] {
  const total = Math.max(0, Math.round(amount));
  if (!weights.length) return [];
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (sum > 0 ? (total * x) / sum : total / w.length));
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; parts[i]++; left--; }
  return parts;
}

// Smart Trip planning engine. Pure functions: no database, no network, so it
// runs the same in the admin editor, on the server and in tests.
//
// Rules: a fixed session is an anchor (the car must arrive by session time
// minus the arrival buffer); other stops fit around anchors, inside opening
// hours, and the trip should end within its booked hours.

export type Session = { time: string; days?: number[] };
export type Program = {
  id: string; name: string; durationMin: number; bookingRequired?: boolean; arrivalBufferMin?: number;
  feeAdult?: number; feeChild?: number; feeIncluded?: boolean; sessions: Session[];
};
/** A date range that changes the normal schedule: closed, or different session times. */
export type ScheduleException = { from: string; to: string; closed?: boolean; programId?: string; sessions?: string[]; note?: string };
export type AttractionData = {
  id: string; name: string; latitude: number | null; longitude: number | null;
  openTime: string | null; closeTime: string | null; lastEntry: string | null; closedDays: number[];
  durationMin: number; arrivalBufferMin: number; programs: Program[]; exceptions: ScheduleException[]; tags: string[];
  bring?: string[]; dressCode?: string | null;
};
export type Priority = "fixed" | "must" | "nice";
export type StopKind = "attraction" | "meal" | "custom";
export type TripStop = {
  id: string; kind: StopKind; name: string; attractionId?: string; programId?: string; sessionTime?: string;
  lat?: number | null; lng?: number | null; durationMin: number; priority: Priority; locked?: boolean;
  windowStart?: string; windowEnd?: string; note?: string; skipped?: boolean;
};
export type Point = { lat: number; lng: number };
export type Problem = { level: "error" | "warning"; stopId?: string; message: string };
export type PlannedStop = TripStop & { travelMin: number; arrival: number; start: number; end: number; wait: number; problems: Problem[] };
export type Plan = {
  stops: PlannedStop[]; returnTravel: number; returnAt: number; startAt: number; endLimit: number; overBy: number;
  totalDrive: number; totalActivity: number; totalWait: number; problems: Problem[];
};
export type PlanInput = {
  date: string | null; startMin: number; from: Point | null; end: Point | null; endLimit: number;
  attractions: Record<string, AttractionData>; travel: (a: Point, b: Point) => number;
};

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const fmt = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
export const duration = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`; };
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Straight-line distance with a road factor: the fallback when no road times are available. */
export function estimateDriveMinutes(a: Point, b: Point, kmh = 40) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h)) * 1.35;
  return km < 0.2 ? 0 : Math.max(5, Math.round((km / kmh) * 60));
}

function exceptionFor(a: AttractionData, date: string | null, programId?: string) {
  if (!date) return null;
  return a.exceptions.find((e) => date >= e.from && date <= e.to && (!e.programId || e.programId === programId)) ?? null;
}

/** Is the attraction closed all day on this date (weekly closing day or a blackout)? */
export function closedOn(a: AttractionData, date: string | null) {
  if (!date) return false;
  if (a.closedDays.includes(weekday(date))) return true;
  const ex = a.exceptions.find((e) => date >= e.from && date <= e.to && !e.programId);
  return Boolean(ex?.closed);
}

/** Session start times for a program on a date, after weekday rules and exceptions. */
export function sessionsOn(a: AttractionData, program: Program, date: string | null): string[] {
  if (closedOn(a, date)) return [];
  const ex = exceptionFor(a, date, program.id);
  if (ex?.closed) return [];
  if (ex?.sessions?.length) return [...ex.sessions].sort();
  const day = date ? weekday(date) : null;
  return program.sessions.filter((s) => !s.days?.length || day === null || s.days.includes(day)).map((s) => s.time).sort();
}

const pointOf = (s: TripStop): Point | null => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);

/** Times every stop in the given order. Never reorders. */
export function schedule(stops: TripStop[], input: PlanInput): Plan {
  const planned: PlannedStop[] = [];
  const problems: Problem[] = [];
  let t = input.startMin, prev = input.from, drive = 0, activity = 0, waited = 0;
  for (const stop of stops) {
    if (stop.skipped) continue;
    const here = pointOf(stop);
    const own: Problem[] = [];
    const travelMin = prev && here ? input.travel(prev, here) : 0;
    if (!here) own.push({ level: "warning", stopId: stop.id, message: `${stop.name}: no map location, so drive time is not counted.` });
    const arrival = t + travelMin;
    const attraction = stop.attractionId ? input.attractions[stop.attractionId] : undefined;
    const program = attraction?.programs.find((p) => p.id === stop.programId);
    let start = arrival;
    if (attraction && closedOn(attraction, input.date)) own.push({ level: "error", stopId: stop.id, message: `${stop.name} is closed on this date.` });
    if (stop.sessionTime) {
      const session = toMin(stop.sessionTime);
      const buffer = program?.arrivalBufferMin ?? attraction?.arrivalBufferMin ?? 0;
      const needBy = session - buffer;
      if (arrival > needBy) own.push({ level: "error", stopId: stop.id, message: `Arrives at ${fmt(arrival)}, ${arrival - needBy} min after the ${fmt(needBy)} check-in for the ${stop.sessionTime} session.` });
      if (attraction && program && !sessionsOn(attraction, program, input.date).includes(stop.sessionTime))
        own.push({ level: "error", stopId: stop.id, message: `There is no ${stop.sessionTime} session of ${program.name} on this date.` });
      start = Math.max(session, arrival);
    } else {
      if (attraction?.openTime && start < toMin(attraction.openTime)) start = toMin(attraction.openTime);
      if (stop.windowStart && start < toMin(stop.windowStart)) start = toMin(stop.windowStart);
    }
    const end = start + stop.durationMin;
    if (attraction?.closeTime && start >= toMin(attraction.closeTime)) own.push({ level: "error", stopId: stop.id, message: `${stop.name} closes at ${attraction.closeTime}; arrival is ${fmt(start)}.` });
    else if (attraction?.lastEntry && start > toMin(attraction.lastEntry)) own.push({ level: "error", stopId: stop.id, message: `Last entry to ${stop.name} is ${attraction.lastEntry}; arrival is ${fmt(start)}.` });
    else if (attraction?.closeTime && end > toMin(attraction.closeTime)) own.push({ level: "warning", stopId: stop.id, message: `The visit runs past closing (${attraction.closeTime}) by ${end - toMin(attraction.closeTime)} min.` });
    if (stop.windowEnd && start > toMin(stop.windowEnd)) own.push({ level: "warning", stopId: stop.id, message: `${stop.name} starts at ${fmt(start)}, after the ${stop.windowEnd} window.` });
    planned.push({ ...stop, travelMin, arrival, start, end, wait: start - arrival, problems: own });
    problems.push(...own);
    drive += travelMin; activity += stop.durationMin; waited += start - arrival;
    t = end; prev = here ?? prev;
  }
  const returnTravel = prev && input.end ? input.travel(prev, input.end) : 0;
  const returnAt = t + returnTravel;
  const overBy = Math.max(0, returnAt - input.endLimit);
  if (overBy > 0) problems.push({ level: "error", message: `The trip ends at ${fmt(returnAt)}, ${duration(overBy)} after the booked end time of ${fmt(input.endLimit)}.` });
  if (waited >= 45) problems.push({ level: "warning", message: `${duration(waited)} of waiting in total; consider another stop in the gap.` });
  return { stops: planned, returnTravel, returnAt, startAt: input.startMin, endLimit: input.endLimit, overBy, totalDrive: drive + returnTravel, totalActivity: activity, totalWait: waited, problems };
}

const errorCount = (p: Plan) => p.problems.filter((x) => x.level === "error").length;
const score = (p: Plan) => errorCount(p) * 100_000 + p.overBy * 100 + p.totalDrive + p.totalWait * 0.5;

/**
 * Reorders the stops: fixed sessions and locked stops keep their order, the
 * others go wherever they cost least. "Nice to have" stops that no longer fit
 * are marked skipped rather than breaking the trip.
 */
export function autoArrange(stops: TripStop[], input: PlanInput): TripStop[] {
  const anchored = stops.filter((s) => s.locked || s.sessionTime);
  const fixedSorted = [...anchored].sort((a, b) => (a.sessionTime && b.sessionTime && !a.locked && !b.locked ? toMin(a.sessionTime) - toMin(b.sessionTime) : 0));
  let seq: TripStop[] = fixedSorted.map((s) => ({ ...s, skipped: false }));
  const rank = { fixed: 0, must: 1, nice: 2 } as const;
  const flexible = stops.filter((s) => !s.locked && !s.sessionTime).sort((a, b) => rank[a.priority] - rank[b.priority]);
  for (const stop of flexible) {
    const candidate = { ...stop, skipped: false };
    let best: TripStop[] | null = null, bestScore = Infinity;
    for (let i = 0; i <= seq.length; i++) {
      const trial = [...seq.slice(0, i), candidate, ...seq.slice(i)];
      const s = score(schedule(trial, input));
      if (s < bestScore) { bestScore = s; best = trial; }
    }
    const before = schedule(seq, input);
    const after = best ? schedule(best, input) : before;
    const breaks = errorCount(after) > errorCount(before) || after.overBy > before.overBy;
    if (stop.priority === "nice" && breaks) seq = [...seq, { ...stop, skipped: true }];
    else seq = best ?? [...seq, candidate];
  }
  return seq;
}

export type Alternative = { label: string; returnAt: number; fits: boolean; stops: TripStop[]; extendHours?: number };

/** Ways to bring an over-long trip back inside its hours. The admin picks one. */
export function alternatives(stops: TripStop[], input: PlanInput): Alternative[] {
  const base = schedule(stops, input);
  if (base.overBy <= 0) return [];
  const out: Alternative[] = [];
  for (const stop of stops) {
    if (stop.skipped || stop.priority === "fixed" || stop.sessionTime) continue;
    const without = stops.map((s) => (s.id === stop.id ? { ...s, skipped: true } : s));
    const p = schedule(without, input);
    out.push({ label: `Remove ${stop.name}`, returnAt: p.returnAt, fits: p.overBy === 0 && errorCount(p) <= errorCount(base) - 1, stops: without });
    if (stop.durationMin >= 60) {
      const shorter = stops.map((s) => (s.id === stop.id ? { ...s, durationMin: s.durationMin - 30 } : s));
      const q = schedule(shorter, input);
      out.push({ label: `Shorten ${stop.name} (${stop.durationMin} → ${stop.durationMin - 30} min)`, returnAt: q.returnAt, fits: q.overBy === 0, stops: shorter });
    }
  }
  out.sort((a, b) => Number(b.fits) - Number(a.fits) || a.returnAt - b.returnAt);
  const extendHours = Math.ceil(base.overBy / 60);
  return [...out.slice(0, 3), { label: `Extend the trip by ${extendHours} hour${extendHours > 1 ? "s" : ""}`, returnAt: base.returnAt, fits: true, stops, extendHours }];
}

/** Entrance fees: included ones go in the price, the rest are paid on the day. */
export function tripFees(stops: TripStop[], attractions: Record<string, AttractionData>, adults: number, children: number) {
  let included = 0, onSite = 0;
  for (const s of stops) {
    if (s.skipped || !s.attractionId || !s.programId) continue;
    const p = attractions[s.attractionId]?.programs.find((x) => x.id === s.programId);
    if (!p) continue;
    const fee = (p.feeAdult ?? 0) * adults + (p.feeChild ?? 0) * children;
    if (p.feeIncluded) included += fee; else onSite += fee;
  }
  return { included, onSite };
}

const PACKING: Record<string, string> = {
  temple: "Clothes that cover shoulders and knees (temple dress code)",
  palace: "Clothes that cover shoulders and knees, and closed shoes",
  beach: "Swimwear, a towel and reef-safe sunscreen",
  island: "Swimwear, a towel and a waterproof bag for phones",
  boat: "Motion-sickness tablets and a waterproof bag",
  waterfall: "Shoes that can get wet",
  hiking: "Comfortable walking shoes",
  nature: "Insect repellent and comfortable shoes",
  outdoor: "A sun hat, sunscreen and water",
  animal: "Clothes you don't mind getting dirty",
  market: "Small cash notes for the market",
  night: "A light jacket and insect repellent",
  cold: "A warm layer for the cool air",
  photo: "A charged phone or camera",
};

/** "What to bring", built from the stops' tags, their own lists and unpaid fees. */
export function packingList(stops: TripStop[], attractions: Record<string, AttractionData>, cashOnSite: number) {
  const items = new Set<string>();
  for (const s of stops) {
    if (s.skipped || !s.attractionId) continue;
    const a = attractions[s.attractionId];
    if (!a) continue;
    for (const tag of a.tags) if (PACKING[tag]) items.add(PACKING[tag]);
    if (a.dressCode) items.add(a.dressCode);
    for (const b of a.bring ?? []) if (b.trim()) items.add(b.trim());
  }
  if (cashOnSite > 0) items.add(`Cash for entrance fees (about THB ${cashOnSite.toLocaleString("en-US")})`);
  items.add("Your phone, charged, to follow the trip live");
  return [...items];
}

export const PACKING_TAGS = Object.keys(PACKING);

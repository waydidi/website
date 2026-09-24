// Traffic colouring for a route line, Grab style.
export type Speed = "NORMAL" | "SLOW" | "TRAFFIC_JAM";
export type SpeedInterval = { start: number; end: number; speed: Speed };
export type TrafficRoute = { path: [number, number][]; intervals: SpeedInterval[]; durationSeconds?: number; fetchedAt: string; sample?: boolean };

export const TRAFFIC_COLORS: Record<Speed, string> = { NORMAL: "#00B14F", SLOW: "#F5A524", TRAFFIC_JAM: "#E5332A" };
// Darker edge drawn under each colour, as in Grab.
export const TRAFFIC_CASING: Record<Speed, string> = { NORMAL: "#007A37", SLOW: "#B87A14", TRAFFIC_JAM: "#A11F18" };
export const TRAFFIC_REFRESH_MS = 30 * 60 * 1000;

// Splits the path into coloured runs; gaps between intervals count as normal.
export function trafficSegments(path: [number, number][], intervals: SpeedInterval[]) {
  const last = path.length - 1;
  const sorted = intervals
    .map((i) => ({ start: Math.max(0, Math.min(last, i.start)), end: Math.max(0, Math.min(last, i.end)), speed: i.speed }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const segments: { points: [number, number][]; speed: Speed }[] = [];
  let cursor = 0;
  for (const interval of sorted) {
    if (interval.start < cursor) continue;
    if (interval.start > cursor) segments.push({ points: path.slice(cursor, interval.start + 1), speed: "NORMAL" });
    segments.push({ points: path.slice(interval.start, interval.end + 1), speed: interval.speed });
    cursor = interval.end;
  }
  if (cursor < last) segments.push({ points: path.slice(cursor), speed: "NORMAL" });
  return segments.filter((s) => s.points.length > 1);
}

// Prototype only: a believable pattern for when live traffic isn't connected.
export function sampleIntervals(pointCount: number, hour: number): SpeedInterval[] {
  const at = (fraction: number) => Math.round((pointCount - 1) * fraction);
  const rush = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
  return [
    { start: at(0), end: at(0.05), speed: "SLOW" },
    { start: at(0.18), end: at(0.24), speed: rush ? "TRAFFIC_JAM" : "SLOW" },
    { start: at(0.55), end: at(0.6), speed: "SLOW" },
    { start: at(0.86), end: at(0.93), speed: rush ? "TRAFFIC_JAM" : "SLOW" },
    { start: at(0.93), end: at(1), speed: "SLOW" },
  ];
}

export function isThailandPoint(value: unknown): value is { latitude: number; longitude: number } {
  const v = value as { latitude?: unknown; longitude?: unknown } | null;
  return !!v && typeof v.latitude === "number" && typeof v.longitude === "number" && v.latitude > 5 && v.latitude < 21 && v.longitude > 97 && v.longitude < 106;
}

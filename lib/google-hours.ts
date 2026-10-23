// Google Places opening hours read into the one open and close time and the closed days an attraction keeps.
// Pure (no runtime imports): used by Telegram /place and Admin → Attractions "Fill from Google Maps".

/** One period of Google Places `regularOpeningHours` (day 0 is Sunday, as in the trip planner). */
export type GooglePeriod = { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };
export type PlaceHours = { openTime: string; closeTime: string; closedDays: number[]; varies: boolean };

const minutesOf = (t: { hour?: number; minute?: number } | undefined) => {
  const h = t?.hour ?? 0, m = t?.minute ?? 0;
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 24 && m >= 0 && m < 60 ? Math.min(h * 60 + m, 1439) : null;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Google's weekly opening hours as the one open and close time an attraction keeps: the hours most days have (a
 * lunch break is bridged, past midnight ends at 23:59), the days with no hours as closed days, and `varies` when the
 * open days do not all share those hours. Null when Google gives none.
 */
export function hoursFromGoogle(periods: GooglePeriod[] | undefined): PlaceHours | null {
  if (!Array.isArray(periods) || !periods.length) return null;
  // Open 24 hours: a single period that opens and never closes.
  if (periods.length === 1 && periods[0]?.open && !periods[0].close) return { openTime: "00:00", closeTime: "23:59", closedDays: [], varies: false };
  const days = new Map<number, { open: number; close: number }>();
  for (const p of periods) {
    const day = p?.open?.day, open = minutesOf(p?.open);
    if (!Number.isInteger(day) || day! < 0 || day! > 6 || open === null || !p.close) continue;
    let close = minutesOf(p.close);
    if (close === null) continue;
    if (p.close.day !== day || close <= open) close = 1439;
    const seen = days.get(day!);
    days.set(day!, seen ? { open: Math.min(seen.open, open), close: Math.max(seen.close, close) } : { open, close });
  }
  if (!days.size) return null;
  const counts = new Map<string, number>();
  for (const { open, close } of days.values()) counts.set(`${open}-${close}`, (counts.get(`${open}-${close}`) ?? 0) + 1);
  // The most common hours; on a tie, the earliest weekday's (Monday first).
  let best = "", most = 0;
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const v = days.get(d); if (!v) continue;
    const k = `${v.open}-${v.close}`, n = counts.get(k)!;
    if (n > most) { best = k; most = n; }
  }
  const [open, close] = best.split("-").map(Number);
  return { openTime: hhmm(open), closeTime: hhmm(close), closedDays: [0, 1, 2, 3, 4, 5, 6].filter((d) => !days.has(d)), varies: counts.size > 1 };
}

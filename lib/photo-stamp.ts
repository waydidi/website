// The text burned into the bottom of a Waydidi GPS camera photo: latitude, longitude and the time it was
// taken (Thailand time). No runtime imports, so it is unit tested directly (tests/photo-stamp.test.mjs).

export type StampGps = { latitude: number; longitude: number; accuracy?: number };

/** Share of the picture's height, from the bottom, that carries the stamp. */
export const STAMP_HEIGHT_SHARE = 0.3;

/** "13/10/2026 17:39:05" in Asia/Bangkok, whatever the phone's own time zone. */
export function stampTime(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}`;
}

/** The lines of the stamp, top to bottom. */
export function stampLines(gps: StampGps, takenAtIso: string) {
  return [
    "Waydidi GPS Camera",
    `Latitude: ${gps.latitude.toFixed(6)}`,
    `Longitude: ${gps.longitude.toFixed(6)}`,
    `Time: ${stampTime(takenAtIso)} (UTC+7)`,
  ];
}

// The text burned into the bottom of a Waydidi GPS camera photo: latitude, longitude and the time it was
// taken (Thailand time). No runtime imports, so it is unit tested directly (tests/photo-stamp.test.mjs).

export type StampGps = { latitude: number; longitude: number; accuracy?: number };

/** Share of the picture's height, from the bottom, that carries the stamp. */
export const STAMP_HEIGHT_SHARE = 0.3;

/** How dark the overlay over that section is (0.3 = a 30% black overlay). */
export const STAMP_OVERLAY_OPACITY = 0.3;

/**
 * A photo from the phone's own camera app may already carry that app's panel at the bottom (a map, weather, clock,
 * address). Waydidi cannot remove what another app printed, so for those photos the section is solid black and
 * hides it; the live Waydidi camera keeps the 30% overlay.
 */
export const STAMP_COVER_OPACITY = 1;

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

// The driver's link token for this browser tab. The trip page swaps it for a session cookie, but some
// phones (Safari opened from Telegram or LINE) don't send that cookie back on the same page, so the
// driver API calls also carry the token in a header. Kept for the tab only (sessionStorage).

const KEY = "waydidi-driver-token";
export const DRIVER_TOKEN_HEADER = "X-Driver-Token";

export function rememberDriverToken(token: string) {
  try { sessionStorage.setItem(KEY, token); } catch { /* storage blocked: the cookie still works */ }
}

/** Headers for driver API requests: the remembered token when there is one. */
export function driverHeaders(extra?: Record<string, string>): Record<string, string> {
  let token: string | null = null;
  try { token = sessionStorage.getItem(KEY); } catch { token = null; }
  return { ...extra, ...(token ? { [DRIVER_TOKEN_HEADER]: token } : {}) };
}

import { FALLBACK_RATES, sanitizeRates } from "@/lib/currency";

const SOURCE = "https://open.er-api.com/v6/latest/THB";
// Backup: European Central Bank rates via Frankfurter (free, no key).
const BACKUP = "https://api.frankfurter.app/latest?from=THB&to=USD,AUD,SGD,CNY";
// Last good rates, used when both sources fail (up to 7 days old) before the fixed fallback.
const LAST_GOOD = "/api/exchange-rates?last-good";
const WINDOW_MS = 12 * 60 * 60 * 1000;
// Windows start at 00:00 and 12:00 Bangkok time (UTC+7).
const OFFSET_MS = 7 * 60 * 60 * 1000;

// Display-only rates (THB base), refreshed once every 12 hours: every visitor
// sees the same rates until the next 00:00 / 12:00 Bangkok. Falls back to fixed rates.
export async function GET(request: Request) {
  const now = Date.now();
  const window = Math.floor((now + OFFSET_MS) / WINDOW_MS);
  const maxAge = Math.max(60, Math.floor(((window + 1) * WINDOW_MS - OFFSET_MS - now) / 1000));
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(new URL(`/api/exchange-rates?w=${window}`, request.url).toString());
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) {
    // Browsers may keep it only until the window ends, not for the age it was stored with.
    const fresh = new Response(cached.body, cached);
    fresh.headers.set("Cache-Control", `public, max-age=${maxAge}`);
    return fresh;
  }
  let rates = FALLBACK_RATES;
  let live = false;
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(4000) });
    const body = (await response.json()) as { result?: string; rates?: unknown };
    if (response.ok && body.result === "success") { rates = sanitizeRates(body.rates); live = true; }
  } catch { /* try the backup */ }
  if (!live) try {
    const response = await fetch(BACKUP, { signal: AbortSignal.timeout(4000) });
    const body = (await response.json()) as { rates?: unknown };
    if (response.ok && body.rates) { rates = sanitizeRates(body.rates); live = true; }
  } catch { /* keep fallback */ }
  const lastKey = new Request(new URL(LAST_GOOD, request.url).toString());
  if (live) await cache?.put(lastKey, Response.json({ rates }, { headers: { "Cache-Control": "public, max-age=604800" } })).catch(() => undefined);
  else {
    const last = await cache?.match(lastKey).then((r) => r?.json() as Promise<{ rates?: unknown }> | undefined).catch(() => undefined);
    if (last?.rates) rates = sanitizeRates(last.rates);
  }
  const result = Response.json({ base: "THB", rates, live, nextUpdate: new Date((window + 1) * WINDOW_MS - OFFSET_MS).toISOString() }, { headers: { "Cache-Control": `public, max-age=${live ? maxAge : 300}` } });
  if (live) await cache?.put(key, result.clone()).catch(() => undefined);
  return result;
}

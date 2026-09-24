import { FALLBACK_RATES, sanitizeRates } from "@/lib/currency";

const SOURCE = "https://open.er-api.com/v6/latest/THB";
const MAX_AGE = 60 * 60 * 6;

// Display-only rates (THB base). Cached at the edge; falls back to fixed rates.
export async function GET(request: Request) {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(new URL("/api/exchange-rates", request.url).toString());
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;
  let rates = FALLBACK_RATES;
  let live = false;
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(4000) });
    const body = (await response.json()) as { result?: string; rates?: unknown };
    if (response.ok && body.result === "success") { rates = sanitizeRates(body.rates); live = true; }
  } catch { /* keep fallback */ }
  const result = Response.json({ base: "THB", rates, live }, { headers: { "Cache-Control": `public, max-age=${live ? MAX_AGE : 300}` } });
  if (live) await cache?.put(key, result.clone()).catch(() => undefined);
  return result;
}

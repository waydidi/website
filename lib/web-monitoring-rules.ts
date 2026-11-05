import { isSiteLang } from "./site-languages";

// Loaded on every page while monitoring is on, so the zod schema lives in web-monitoring-schema.ts.
export const WEB_MONITORING_RETENTION_DAYS = 30;
export const WEB_MONITORING_MAX_BODY = 4096;
export const MONITORING_POSITION_MAX = 10000000;
export const MONITORING_VALUE_MAX = 600000;
export const MONITORING_FILE_PATTERN = /^[A-Za-z0-9._-]{1,120}\.m?js$/;

// Route templates only: booking references, tokens and slugs never leave the browser.
const ROUTE_PATTERNS = [
  ["/", /^\/$/], ["/about", /^\/about$/], ["/contact", /^\/contact$/], ["/help", /^\/help$/], ["/flights", /^\/flights$/],
  ["/hourly", /^\/hourly$/], ["/tours", /^\/tours$/], ["/airport-transfer", /^\/airport-transfer$/],
  ["/destinations", /^\/destinations$/], ["/destinations/[slug]", /^\/destinations\/[^/]+$/],
  ["/blog", /^\/blog$/], ["/blog/[slug]", /^\/blog\/[^/]+$/],
  ["/transfers", /^\/transfers$/], ["/transfers/city/[city]", /^\/transfers\/city\/[^/]+$/], ["/transfers/[slug]", /^\/transfers\/[^/]+$/],
  ["/trips", /^\/trips$/], ["/trips/[slug]", /^\/trips\/[^/]+$/],
  ["/booking/check", /^\/booking\/check$/], ["/booking/manage", /^\/booking\/manage$/],
  ["/booking/confirmation/[reference]", /^\/booking\/confirmation\/[^/]+$/],
  ["/pay/[reference]", /^\/pay\/[^/]+$/], ["/quote/[token]", /^\/quote\/[^/]+$/], ["/itinerary/[token]", /^\/itinerary\/[^/]+$/],
  ["/trip/[reference]", /^\/trip\/[^/]+$/], ["/account", /^\/account(\/.*)?$/],
] as const;
export const MONITORED_ROUTES = ROUTE_PATTERNS.map(([route]) => route) as [string, ...string[]];

export const VITAL_NAMES = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];
export const ERROR_TYPES = ["TypeError", "ReferenceError", "RangeError", "SyntaxError", "ChunkLoadError", "AbortError", "NetworkError", "Error", "Other"] as const;

export function webMonitoringEnabled(bindings: Record<string, unknown>) {
  return bindings.WEB_MONITORING_ENABLED === "1" && typeof bindings.RATE_LIMIT_SALT === "string" && bindings.RATE_LIMIT_SALT.length >= 32;
}

// Unlisted pages (admin, agency, driver and partner links) return null and are not measured.
export function monitoringRoute(pathname: string) {
  const segments = pathname.split("/");
  const path = isSiteLang(segments[1]) ? "/" + segments.slice(2).join("/") : pathname;
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return ROUTE_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function monitoringErrorType(error: unknown): (typeof ERROR_TYPES)[number] {
  const name = error instanceof Error ? error.name : "";
  return (ERROR_TYPES as readonly string[]).includes(name) ? name as (typeof ERROR_TYPES)[number] : "Other";
}

// Only this site's own script files are named; other hosts could reveal what a visitor has installed.
export function monitoringErrorFile(filename: unknown, origin: string) {
  if (typeof filename !== "string" || !filename) return null;
  try {
    const url = new URL(filename);
    if (url.origin !== origin) return null;
    const base = url.pathname.split("/").pop() ?? "";
    return MONITORING_FILE_PATTERN.test(base) ? base : null;
  } catch { return null; }
}

export function monitoringVitalValue(name: VitalName, value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  const rounded = Math.round(name === "CLS" ? value * 1000 : value);
  return rounded <= MONITORING_VALUE_MAX ? rounded : null;
}

const LIMITS: Record<VitalName, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [100, 250], FCP: [1800, 3000], TTFB: [800, 1800] };
export function vitalRating(name: VitalName, value: number) {
  const [good, poor] = LIMITS[name];
  return value <= good ? "good" : value <= poor ? "needs work" : "poor";
}

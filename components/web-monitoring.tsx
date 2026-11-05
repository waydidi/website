"use client";
import { useEffect } from "react";
import { browserAnalyticsAllowed } from "@/lib/privacy-consent";
import {
  monitoringErrorFile, monitoringErrorType, monitoringRoute, monitoringVitalValue,
  type VitalName,
} from "@/lib/web-monitoring-rules";
import type { WebMonitoringEvent } from "@/lib/web-monitoring-schema";

const MAX_ERRORS_PER_PAGE = 20;
const MAX_BATCH = 10;
let started = false;
let stopped = false;
let queue: WebMonitoringEvent[] = [];
let errorCount = 0;
let timer: number | undefined;

const device = () => window.matchMedia("(max-width: 767px)").matches ? "mobile" as const : "desktop" as const;
function connection() {
  const type = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  return type === "slow-2g" || type === "2g" || type === "3g" || type === "4g" ? type : "unknown" as const;
}
// Optional measurement: a failed send is dropped, never retried, and never affects the page.
function flush() {
  window.clearTimeout(timer);
  timer = undefined;
  if (stopped || !browserAnalyticsAllowed()) { queue = []; return; }
  while (queue.length) {
    const events = queue.splice(0, MAX_BATCH);
    void fetch("/api/web-monitoring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), keepalive: true })
      .then(response => { if (response.status === 429) stopped = true; })
      .catch(() => undefined);
  }
}
function add(event: WebMonitoringEvent) {
  if (stopped) return;
  queue.push(event);
  if (queue.length >= MAX_BATCH) flush();
  else if (timer === undefined) timer = window.setTimeout(flush, 5000);
}
function addError(error: unknown, filename?: unknown, line?: unknown, column?: unknown) {
  const route = monitoringRoute(location.pathname);
  if (!route || !browserAnalyticsAllowed() || errorCount >= MAX_ERRORS_PER_PAGE) return;
  errorCount += 1;
  const file = monitoringErrorFile(filename, location.origin);
  const position = (value: unknown) => file && typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10000000 ? value : null;
  add({ kind: "error", route, errorType: monitoringErrorType(error), file, line: position(line), column: position(column), device: device() });
}
export async function startWebMonitoring() {
  if (started || !browserAnalyticsAllowed()) return;
  started = true;
  // Speed belongs to the page that loaded; a later in-app move does not change it.
  const route = monitoringRoute(location.pathname);
  window.addEventListener("error", event => addError(event.error, event.filename, event.lineno, event.colno));
  window.addEventListener("unhandledrejection", event => addError(event.reason));
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  if (!route) return;
  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("web-vitals");
    const report = ({ name, value }: { name: string; value: number }) => {
      const stored = monitoringVitalValue(name as VitalName, value);
      if (stored !== null && browserAnalyticsAllowed()) add({ kind: "vital", route, name: name as VitalName, value: stored, device: device(), connection: connection() });
    };
    for (const observe of [onCLS, onFCP, onINP, onLCP, onTTFB]) observe(report);
  } catch { /* speed is optional; errors above are still reported */ }
}

export function WebMonitoring() {
  useEffect(() => {
    void startWebMonitoring();
    const consentChanged = () => void startWebMonitoring();
    window.addEventListener("waydidi:consent", consentChanged);
    return () => window.removeEventListener("waydidi:consent", consentChanged);
  }, []);
  return null;
}

"use client";

import type { DriverRouteStop } from "@/lib/route-stop-display";
import { useI18n } from "@/components/i18n-provider";
import { parseRouteStopSnapshots, stopDurationMinutes, stopTotalMinor } from "@/lib/route-stops";

/** Always show the purchased snapshot, never the current stop catalogue. Stops are outbound only. */
export function RouteStopsDetails({ routeStopsJson, driver = false, driverStops }: { routeStopsJson?: string | null; driver?: boolean; driverStops?: DriverRouteStop[] }) {
  const { t } = useI18n();
  // A corrupt snapshot must not crash the whole trip page; outbound fulfillment still rejects it.
  let stops: ReturnType<typeof parseRouteStopSnapshots>;
  try { stops = parseRouteStopSnapshots(routeStopsJson); } catch { return null; }
  const shown = driver && driverStops ? driverStops : stops;
  if (!shown.length) return null;
  return <section className="my-4 rounded-2xl bg-slate-50 p-4 text-sm" aria-label={driver ? "จุดแวะเที่ยว (ขาไป)" : t("routeStops.snapshotHeading")}>
    <h3 className="font-bold">{driver ? "จุดแวะเที่ยว (ขาไป)" : t("routeStops.snapshotHeading")}</h3>
    <ol className="mt-2 grid gap-2">{shown.map((stop, i) => <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <span><span translate="no" className="font-semibold">{stop.name}</span> · {driver ? `${stop.durationMinutes} นาที` : t("routeStops.snapshotMinutes", { minutes: stop.durationMinutes })}</span>
      {!driver && <span className="font-semibold">THB {(stops[i].priceMinor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
    </li>)}</ol>
    {!driver && <p className="mt-3 border-t border-slate-200 pt-2 font-semibold">{t("routeStops.snapshotTotal")} · {t("routeStops.snapshotMinutes", { minutes: stopDurationMinutes(stops) })} · THB {(stopTotalMinor(stops) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
  </section>;
}

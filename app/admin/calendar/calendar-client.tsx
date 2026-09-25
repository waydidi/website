"use client";

import { useSyncExternalStore } from "react";
import CalendarWorkspace from "./calendar-workspace";

const noop = () => () => {};

// The calendar starts from "today in Bangkok", so render it only in the browser to avoid a server/client date mismatch.
export function CalendarClient({ email, serviceType }: { email: string; serviceType?: "transfer" | "hourly" | "tour" }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <CalendarWorkspace email={email} serviceType={serviceType} embedded={Boolean(serviceType)} /> : <p className="px-8 py-10 text-slate-500">Loading calendar…</p>;
}

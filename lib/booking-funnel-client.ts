"use client";
import { useEffect } from "react";
import { permitsAnalytics } from "./privacy-consent";

type Service = "transfer" | "hourly";
type Stage = "quote" | "details" | "payment";
type Journey = { id: string; created: number; finished?: boolean; events: Partial<Record<Stage, { id: string; sent: boolean }>> };
const KEY = "waydidi-funnel-v1";
const DAY = 86400000;
let configured = false;
let enabled = false;
let initialized = false;
let journeys: Partial<Record<Service, Journey>> = {};
let withdrawals: string[] = [];
const inflight = new Set<string>();
const heldUntil = new Map<string, number>();

function allowed() {
  return permitsAnalytics(document.cookie, navigator.doNotTrack, (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}
function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ journeys, withdrawals })); } catch { /* optional measurement may remain in memory */ }
}
function read() {
  try {
    const state = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    const uuid = (id: unknown) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
    if (!state || typeof state !== "object") return;
    withdrawals = Array.isArray(state.withdrawals) ? state.withdrawals.filter(uuid).slice(0, 10) : [];
    if (!allowed()) {
      for (const service of ["transfer", "hourly"] as const) if (uuid(state.journeys?.[service]?.id)) withdrawals.push(state.journeys[service].id);
      persist(); return;
    }
    for (const service of ["transfer", "hourly"] as const) {
      const value = state.journeys?.[service];
      if (!uuid(value?.id) || !Number.isFinite(value.created) || value.created > Date.now() || Date.now() - value.created > DAY) continue;
      const events: Journey["events"] = {};
      for (const stage of ["quote", "details", "payment"] as const) if (uuid(value.events?.[stage]?.id)) events[stage] = { id: value.events[stage].id, sent: value.events[stage].sent === true };
      journeys[service] = { id: value.id, created: value.created, finished: value.finished === true, events };
    }
  } catch { /* malformed or unavailable optional storage starts a fresh journey */ }
}
async function transmit(key: string, method: string, body: unknown) {
  if (inflight.has(key) || (heldUntil.get(key) ?? 0) > Date.now()) return false;
  inflight.add(key);
  try {
    const response = await fetch("/api/funnel", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, signal: AbortSignal.timeout(10000) });
    if (response.status === 429) heldUntil.set(key, Date.now() + 900000);
    return response.status === 204;
  } catch { return false; }
  finally { inflight.delete(key); }
}
async function flush() {
  for (const id of [...withdrawals]) {
    if (await transmit("delete:" + id, "DELETE", { journeyId: id })) { withdrawals = withdrawals.filter(value => value !== id); persist(); }
  }
  if (!enabled || !allowed()) return;
  for (const service of ["transfer", "hourly"] as const) {
    const journey = journeys[service];
    if (!journey || Date.now() - journey.created > DAY) continue;
    for (const stage of ["quote", "details", "payment"] as const) {
      const event = journey.events[stage];
      if (!event || event.sent || !allowed() || journeys[service]?.id !== journey.id) continue;
      if (await transmit(event.id, "POST", { journeyId: journey.id, eventId: event.id, stage, service })) { event.sent = true; persist(); }
    }
  }
}
function consentChanged() {
  if (!allowed() && Object.keys(journeys).length > 0) {
    withdrawals = [...new Set([...withdrawals, ...Object.values(journeys).map(value => value.id)])];
    journeys = {}; persist();
  }
  void flush();
}
function initialize() {
  if (initialized) return;
  initialized = true; read();
  window.addEventListener("waydidi:consent", consentChanged);
  window.addEventListener("online", () => void flush());
  window.addEventListener("focus", consentChanged);
  window.setInterval(consentChanged, 20000);
}
export function bookingFunnelId(service: Service) {
  if (!enabled || !allowed()) return undefined;
  const value = journeys[service];
  return value && Date.now() - value.created <= DAY ? value.id : undefined;
}
export function finishBookingFunnel() {
  initialize();
  if (!Object.keys(journeys).length) return;
  for (const value of Object.values(journeys)) value.finished = true;
  persist();
}
export async function observeBookingFunnelStage(stage: string, service: Service, hasQuote: boolean, active = () => true) {
  initialize();
  if (!configured) {
    try { const response = await fetch("/api/funnel/config", { cache: "no-store" }); const result = await response.json(); enabled = response.ok && result.enabled === true; configured = true; }
    catch { return; }
  }
  if (!active() || !enabled || !allowed() || !hasQuote || !["vehicle", "details", "payment", "review"].includes(stage)) return;
  let journey = journeys[service];
  if (!journey || journey.finished || Date.now() - journey.created > DAY) journey = journeys[service] = { id: crypto.randomUUID(), created: Date.now(), events: {} };
  // Record only observed UI stages; never invent missing details/payment.
  const observed: Stage = stage === "vehicle" ? "quote" : stage === "details" ? "details" : "payment";
  journey.events[observed] ??= { id: crypto.randomUUID(), sent: false };
  persist(); void flush();
}
export function useBookingFunnel(stage: string, service: Service, hasQuote: boolean) {
  useEffect(() => {
    let active = true;
    const observe = () => observeBookingFunnelStage(stage, service, hasQuote, () => active);
    void observe();
    window.addEventListener("waydidi:consent", observe);
    return () => { active = false; window.removeEventListener("waydidi:consent", observe); };
  }, [stage, service, hasQuote]);
}

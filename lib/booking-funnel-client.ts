"use client";
import { useEffect } from "react";
import { browserAnalyticsAllowed } from "./privacy-consent";
import { sha256 } from "./security";

type Service = "transfer" | "hourly" | "tour";
type Stage = "quote" | "details" | "payment";
type Journey = { id: string; created: number; finished?: boolean; events: Partial<Record<Stage, { id: string; sent: boolean }>> };
const KEY = "waydidi-funnel-v1";
const DAY = 86400000;
let configured = false;
let enabled = false;
let initialized = false;
let journeys: Record<string, Journey> = {};
let withdrawals: string[] = [];
let checkouts: Record<string, string> = {};
const inflight = new Set<string>();
const heldUntil = new Map<string, number>();
const tourKeys = new Map<string, string>();

const allowed = browserAnalyticsAllowed;
function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ journeys, withdrawals, checkouts })); } catch { /* optional measurement may remain in memory */ }
}
const serviceForKey = (key: string): Service | null => key === "transfer" || key === "hourly" ? key : /^tour:[a-f0-9]{64}$/.test(key) ? "tour" : null;
function read() {
  try {
    const state = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    const uuid = (id: unknown) => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
    if (!state || typeof state !== "object") return;
    withdrawals = Array.isArray(state.withdrawals) ? [...new Set<string>(state.withdrawals.filter(uuid))] : [];
    const storedJourneys = state.journeys && typeof state.journeys === "object" ? Object.entries(state.journeys) : [];
    if (!allowed()) {
      for (const [key, entry] of storedJourneys) { const value = entry as Journey; if (serviceForKey(key) && uuid(value?.id)) withdrawals.push(value.id); }
      persist(); return;
    }
    for (const [key, entry] of storedJourneys) {
      if (!serviceForKey(key)) continue;
      const value = entry as Journey;
      if (!uuid(value?.id) || !Number.isFinite(value.created) || value.created > Date.now() || Date.now() - value.created > DAY) continue;
      const events: Journey["events"] = {};
      for (const stage of ["quote", "details", "payment"] as const) { const saved = value.events?.[stage]; if (saved && uuid(saved.id)) events[stage] = { id: saved.id, sent: saved.sent === true }; }
      journeys[key] = { id: value.id, created: value.created, finished: value.finished === true, events };
    }
    if (state.checkouts && typeof state.checkouts === "object") {
      for (const [hash, id] of Object.entries(state.checkouts)) if (/^[a-f0-9]{64}$/.test(hash) && uuid(id) && Object.values(journeys).some(value => value.id === id)) checkouts[hash] = id as string;
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
  for (const [key, journey] of Object.entries(journeys)) {
    const service = serviceForKey(key);
    if (!service) continue;
    if (!journey || Date.now() - journey.created > DAY) continue;
    for (const stage of ["quote", "details", "payment"] as const) {
      const event = journey.events[stage];
      if (!event || event.sent || !allowed() || journeys[key]?.id !== journey.id) continue;
      if (await transmit(event.id, "POST", { journeyId: journey.id, eventId: event.id, stage, service })) { event.sent = true; persist(); }
    }
  }
}
function consentChanged() {
  if (!allowed() && Object.keys(journeys).length > 0) {
    withdrawals = [...new Set([...withdrawals, ...Object.values(journeys).map(value => value.id)])];
    journeys = {}; tourKeys.clear(); checkouts = {}; persist();
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
export function bookingFunnelId(service: "transfer" | "hourly") {
  if (!enabled || !allowed()) return undefined;
  const value = journeys[service];
  return value && !value.finished && Date.now() - value.created <= DAY ? value.id : undefined;
}
export function tourFunnelId(context: string) {
  if (!enabled || !allowed()) return undefined;
  const key = tourKeys.get(context), value = key ? journeys[key] : undefined;
  return value && !value.finished && Date.now() - value.created <= DAY ? value.id : undefined;
}
export async function bindFunnelCheckout(journeyId: string | undefined, reference: string | undefined) {
  if (!journeyId || !reference || !enabled || !allowed() || !Object.values(journeys).some(value => value.id === journeyId)) return;
  const hash = await sha256("funnel-checkout:" + reference);
  if (!allowed() || !Object.values(journeys).some(value => value.id === journeyId)) return;
  checkouts[hash] = journeyId;
  persist();
}
export async function finishBookingFunnel(reference: string) {
  initialize();
  if (!Object.keys(journeys).length) return;
  // Match the verified booking, even when the customer went back to another quote.
  // Raw booking references and URLs are never persisted in the analytics state.
  const hash = await sha256("funnel-checkout:" + reference);
  const current = Object.values(journeys).find(value => value.id === checkouts[hash]);
  if (!current) return;
  current.finished = true;
  delete checkouts[hash];
  persist();
}
export async function observeBookingFunnelStage(stage: string, service: Service, hasQuote: boolean, active = () => true, context?: string) {
  initialize();
  if (!configured) {
    try { const response = await fetch("/api/funnel/config", { cache: "no-store", signal: AbortSignal.timeout(3000) }); const result = await response.json(); enabled = response.ok && result.enabled === true; configured = true; }
    catch { return; }
  }
  if (!active() || !enabled || !allowed() || !hasQuote || !["vehicle", "details", "payment", "review"].includes(stage)) return;
  // A private itinerary token is only hashed for tab-local separation. Neither
  // the token nor its digest is included in any telemetry request.
  if (service === "tour" && !context) return;
  const key = service === "tour" ? tourKeys.get(context!) ?? "tour:" + await sha256("itinerary:" + context) : service;
  if (!active() || !allowed()) return;
  if (service === "tour") tourKeys.set(context!, key);
  let journey = journeys[key];
  if (!journey || journey.finished || Date.now() - journey.created > DAY) journey = journeys[key] = { id: crypto.randomUUID(), created: Date.now(), events: {} };
  // Record only observed UI stages; never invent missing details/payment.
  const observed: Stage = stage === "vehicle" ? "quote" : stage === "details" ? "details" : "payment";
  journey.events[observed] ??= { id: crypto.randomUUID(), sent: false };
  persist(); void flush();
  return journey.id;
}
export function useBookingFunnel(stage: string, service: Service, hasQuote: boolean, context?: string) {
  useEffect(() => {
    let active = true;
    const observe = () => { void observeBookingFunnelStage(stage, service, hasQuote, () => active, context).catch(() => undefined); };
    void observe();
    window.addEventListener("waydidi:consent", observe);
    return () => { active = false; window.removeEventListener("waydidi:consent", observe); };
  }, [stage, service, hasQuote, context]);
}

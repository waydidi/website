import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";

// Non's safety rails: limits on paid place searches, a spam guard, and the team's alerts
// (closures, flooding, disasters) which always come before anything from the internet.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const nowIso = () => new Date().toISOString();

export type Limits = { perChat: number; perCustomerDay: number; siteDay: number; spamMessages: number; spamMinutes: number; spamPauseMinutes: number };
export const DEFAULT_LIMITS: Limits = { perChat: 20, perCustomerDay: 30, siteDay: 300, spamMessages: 20, spamMinutes: 10, spamPauseMinutes: 15 };
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };

export async function getLimits(): Promise<Limits> {
  const row = await db().prepare("SELECT value FROM app_settings WHERE key='cee_limits'").first<{ value: string }>().catch(() => null);
  let v: Partial<Limits> = {};
  try { v = row ? JSON.parse(row.value) : {}; } catch { v = {}; }
  return {
    perChat: clamp(v.perChat, 0, 200, DEFAULT_LIMITS.perChat), perCustomerDay: clamp(v.perCustomerDay, 0, 500, DEFAULT_LIMITS.perCustomerDay),
    siteDay: clamp(v.siteDay, 0, 10000, DEFAULT_LIMITS.siteDay), spamMessages: clamp(v.spamMessages, 5, 200, DEFAULT_LIMITS.spamMessages),
    spamMinutes: clamp(v.spamMinutes, 1, 120, DEFAULT_LIMITS.spamMinutes), spamPauseMinutes: clamp(v.spamPauseMinutes, 1, 1440, DEFAULT_LIMITS.spamPauseMinutes),
  };
}
export async function saveLimits(input: Partial<Limits>) {
  const cur = await getLimits();
  const next: Limits = { ...cur, ...Object.fromEntries(Object.entries(input).filter(([k]) => k in DEFAULT_LIMITS)) } as Limits;
  await db().prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('cee_limits',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(next), nowIso()).run();
  return getLimits(); // re-read so out-of-range values fall back to the defaults
}

/** Who is asking: the WhatsApp/LINE user, or the website visitor's chat (one per browser). */
export const actorFor = (c: { id: string; channel?: string | null; channel_user_id?: string | null; customer_email?: string | null }) =>
  c.channel && c.channel !== "web" && c.channel_user_id ? `${c.channel}:${c.channel_user_id}` : c.customer_email ? `email:${c.customer_email.toLowerCase()}` : `chat:${c.id}`;

const dayAgo = () => new Date(Date.now() - 86400_000).toISOString();
export const searchKey = async (query: string, near: string) => (await sha256(`${query.trim().toLowerCase()}|${near.trim().toLowerCase()}`)).slice(0, 32);

/** May this chat run another paid place search? Cached repeats are free and always allowed. */
export async function placeSearchAllowed(conversationId: string, actor: string): Promise<{ ok: true } | { ok: false; reason: string; siteLimit?: boolean }> {
  const l = await getLimits();
  const count = async (sql: string, ...v: unknown[]) => (await db().prepare(sql).bind(...v).first<{ n: number }>())?.n ?? 0;
  if (await count("SELECT COUNT(*) n FROM place_searches WHERE conversation_id=? AND cached=0", conversationId) >= l.perChat)
    return { ok: false, reason: "Place search limit for this chat reached. Answer from earlier results or Waydidi's notes, or offer to ask the team." };
  if (await count("SELECT COUNT(*) n FROM place_searches WHERE actor=? AND cached=0 AND created_at>?", actor, dayAgo()) >= l.perCustomerDay)
    return { ok: false, reason: "This customer has used today's place searches. Say you can't look up more places today and offer the team." };
  if (await count("SELECT COUNT(*) n FROM place_searches WHERE cached=0 AND created_at>?", dayAgo()) >= l.siteDay)
    return { ok: false, reason: "Place search is paused for today. Answer from Waydidi's notes or offer the team.", siteLimit: true };
  return { ok: true };
}
export const logPlaceSearch = (conversationId: string, actor: string, key: string, cached: boolean) =>
  db().prepare("INSERT INTO place_searches(id,conversation_id,actor,query_key,cached,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), conversationId, actor, key, cached ? 1 : 0, nowIso()).run();
export async function cachedSearch<T>(key: string): Promise<T | null> {
  const row = await db().prepare("SELECT result_json FROM place_search_cache WHERE query_key=? AND created_at>?").bind(key, dayAgo()).first<{ result_json: string }>().catch(() => null);
  try { return row ? JSON.parse(row.result_json) as T : null; } catch { return null; }
}
export const saveSearch = (key: string, result: unknown) =>
  db().prepare("INSERT INTO place_search_cache(query_key,result_json,created_at) VALUES(?,?,?) ON CONFLICT(query_key) DO UPDATE SET result_json=excluded.result_json,created_at=excluded.created_at").bind(key, JSON.stringify(result), nowIso()).run();
export async function placeSearchStats() {
  const r = await db().prepare("SELECT SUM(cached=0) paid, SUM(cached=1) cached FROM place_searches WHERE created_at>?").bind(dayAgo()).first<{ paid: number | null; cached: number | null }>().catch(() => null);
  const err = await db().prepare("SELECT value FROM app_settings WHERE key='place_search_error'").first<{ value: string }>().catch(() => null);
  let lastError: { status: number; detail: string; at: string } | null = null;
  try { lastError = err ? JSON.parse(err.value) : null; } catch { lastError = null; }
  return { paid: r?.paid ?? 0, cached: r?.cached ?? 0, lastError };
}

/** Too many customer messages in a short time: Non pauses for this chat. Returns true when it should stay quiet. */
export async function spamPaused(conversationId: string) {
  const l = await getLimits();
  const since = new Date(Date.now() - l.spamMinutes * 60_000).toISOString();
  const n = (await db().prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' AND created_at>?").bind(conversationId, since).first<{ n: number }>())?.n ?? 0;
  return n > l.spamMessages;
}

// ---- Alerts: closures, flooding, disasters ----
export type Alert = { id: string; title: string; message: string; areas: string; effect: "info" | "warn" | "stop"; starts_at: string; ends_at: string | null; source_url: string | null; active: number; created_by: string | null; created_at: string; updated_at: string };
export const activeAlerts = async (at = new Date()) => (await db().prepare("SELECT * FROM chat_alerts WHERE active=1 AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) ORDER BY created_at DESC LIMIT 30")
  .bind(at.toISOString(), at.toISOString()).all<Alert>().catch(() => ({ results: [] as Alert[] }))).results;
const words = (a: Alert) => a.areas.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
/** Alerts that apply to any of these texts (a place, address, route). An alert with no areas applies everywhere. */
export function alertsFor(alerts: Alert[], ...texts: (string | null | undefined)[]) {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return alerts.filter((a) => { const w = words(a); return !w.length || w.some((x) => hay.includes(x)); });
}
/** Lines for Non's instructions: every active alert, every reply. */
export function alertBrief(alerts: Alert[]) {
  if (!alerts.length) return "";
  return `\n\nACTIVE WAYDIDI ALERTS (these override anything from Google or general knowledge; mention them whenever the customer's trip or question touches these areas):\n${alerts.map((a) =>
    `- [${a.effect === "stop" ? "STOP SELLING" : a.effect === "warn" ? "WARN" : "INFO"}] ${a.title}${a.areas ? ` (areas: ${a.areas})` : " (everywhere)"}${a.ends_at ? ` until ${a.ends_at.slice(0, 10)}` : ""}: ${a.message}`).join("\n")}\n- For STOP SELLING areas: don't quote or send payment links there; explain the alert and hand over.`;
}

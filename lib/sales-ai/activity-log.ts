import { env } from "cloudflare:workers";
import { redact, redactDetail } from "./redact";

// AI activity log (F13): what Waydidi Assistant and the WhatsApp channel did, why, and what it cost. Append-only from
// application code: there is no edit or delete path except the retention purge. Owner-only to read.
// Writing never throws and never blocks the customer path; a failed log write is reported to the console only.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;

// Same statements as drizzle/0127_sales_ai_foundations.sql: Workers Builds does not apply D1 migrations.
export const FOUNDATION_TABLES = [
  `CREATE TABLE IF NOT EXISTS ai_activity_log(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,event TEXT NOT NULL,status TEXT NOT NULL,actor TEXT NOT NULL,channel TEXT,conversation_id TEXT,correlation_id TEXT,dedupe_key TEXT UNIQUE,model TEXT,latency_ms INTEGER,input_tokens INTEGER,output_tokens INTEGER,cost_usd_micros INTEGER,price_version TEXT,summary TEXT NOT NULL,detail_json TEXT)`,
  `CREATE INDEX IF NOT EXISTS ai_activity_created ON ai_activity_log(created_at)`,
  `CREATE INDEX IF NOT EXISTS ai_activity_conversation ON ai_activity_log(conversation_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS ai_activity_event ON ai_activity_log(event,created_at)`,
  `CREATE TABLE IF NOT EXISTS whatsapp_media(media_id TEXT PRIMARY KEY,conversation_id TEXT,channel_message_id TEXT NOT NULL,kind TEXT NOT NULL,mime_type TEXT,sha256 TEXT,received_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS whatsapp_media_conversation ON whatsapp_media(conversation_id,received_at)`,
  `CREATE TABLE IF NOT EXISTS channel_delivery_status(channel_message_id TEXT PRIMARY KEY,channel TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('sent','delivered','read','failed')),error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
];

let ready: Promise<unknown> | null = null;
export function ensureFoundationTables() {
  ready ??= db().batch(FOUNDATION_TABLES.map((sql) => db().prepare(sql))).catch((error) => { ready = null; throw error; });
  return ready;
}

export const ACTIVITY_EVENTS = ["inbound_message", "media_received", "delivery_status", "model_call", "handover", "send_suppressed", "send_failed", "kill_switch", "quote_drafted", "quote_price_edited", "quote_approved", "quote_sent", "quote_rejected", "mode_change", "security", "trip_plan_requested", "attachment_read", "lead_hot", "followup_sent", "followup_skipped", "quote_review", "loss_labeled"] as const;
export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];
export type ActivityStatus = "ok" | "error" | "suppressed" | "skipped";

export type ActivityInput = {
  event: ActivityEvent; status: ActivityStatus; actor: string; summary: string;
  channel?: string | null; conversationId?: string | null; correlationId?: string | null; dedupeKey?: string | null;
  model?: string | null; latencyMs?: number | null; inputTokens?: number | null; outputTokens?: number | null;
  costUsd?: number | null; priceVersion?: string | null; detail?: Record<string, unknown> | null;
};

const int = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null);

/** Appends one event. A repeated dedupeKey is ignored (a webhook retry does not log twice). */
export async function logActivity(e: ActivityInput) {
  try {
    await ensureFoundationTables();
    await db().prepare(`INSERT INTO ai_activity_log(id,created_at,event,status,actor,channel,conversation_id,correlation_id,dedupe_key,model,latency_ms,input_tokens,output_tokens,cost_usd_micros,price_version,summary,detail_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`).bind(
      crypto.randomUUID(), new Date().toISOString(), e.event, e.status, redact(e.actor, 80), e.channel ?? null, e.conversationId ?? null,
      e.correlationId ?? e.conversationId ?? null, e.dedupeKey ?? null, e.model ?? null, int(e.latencyMs), int(e.inputTokens), int(e.outputTokens),
      e.costUsd == null ? null : int(e.costUsd * 1e6), e.priceVersion ?? null, redact(e.summary) || e.event,
      e.detail ? JSON.stringify(redactDetail(e.detail)) : null,
    ).run();
  } catch (error) {
    console.error("ai activity log failed", error instanceof Error ? error.message : "unknown");
  }
}

export type ActivityRow = {
  id: string; created_at: string; event: string; status: string; actor: string; channel: string | null; conversation_id: string | null;
  correlation_id: string | null; model: string | null; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null;
  cost_usd_micros: number | null; price_version: string | null; summary: string; detail_json: string | null;
};
export type ActivityFilter = { event?: string; status?: string; conversationId?: string; from?: string; to?: string; before?: string; limit?: number };

/** Newest first, keyset-paged by created_at|id ("before" is the last row's cursor). */
export async function listActivity(f: ActivityFilter) {
  await ensureFoundationTables();
  const where: string[] = [], args: unknown[] = [];
  if (f.event) { where.push("event=?"); args.push(f.event); }
  if (f.status) { where.push("status=?"); args.push(f.status); }
  if (f.conversationId) { where.push("(conversation_id=? OR correlation_id=?)"); args.push(f.conversationId, f.conversationId); }
  if (f.from) { where.push("created_at>=?"); args.push(f.from); }
  if (f.to) { where.push("created_at<?"); args.push(f.to); }
  if (f.before) {
    const [at, id] = f.before.split("|");
    where.push("(created_at<? OR (created_at=? AND id<?))"); args.push(at, at, id ?? "");
  }
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = (await db().prepare(`SELECT * FROM ai_activity_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...args, limit + 1).all<ActivityRow>()).results;
  const page = rows.slice(0, limit), last = page[page.length - 1];
  return { rows: page, next: rows.length > limit && last ? `${last.created_at}|${last.id}` : null };
}

/** Model calls and estimated cost for a period (unknown-cost calls counted separately). */
export async function activityCost(from: string, to: string) {
  await ensureFoundationTables();
  return await db().prepare(`SELECT COUNT(*) calls,COALESCE(SUM(cost_usd_micros),0) micros,SUM(CASE WHEN cost_usd_micros IS NULL THEN 1 ELSE 0 END) unknown_cost,
    COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens FROM ai_activity_log WHERE event='model_call' AND created_at>=? AND created_at<?`).bind(from, to)
    .first<{ calls: number; micros: number; unknown_cost: number; input_tokens: number; output_tokens: number }>();
}

export const activityRetentionDays = () => {
  const n = Number(vars().AI_ACTIVITY_RETENTION_DAYS);
  return Number.isInteger(n) && n >= 30 && n <= 3650 ? n : 180;
};

/** Hourly retention purge: activity log, media references and delivery statuses older than the retention period. */
export async function purgeActivity(at = new Date()) {
  await ensureFoundationTables();
  const cutoff = new Date(at.getTime() - activityRetentionDays() * 86400000).toISOString();
  await db().batch([
    db().prepare("DELETE FROM ai_activity_log WHERE created_at<?").bind(cutoff),
    db().prepare("DELETE FROM whatsapp_media WHERE received_at<?").bind(cutoff),
    db().prepare("DELETE FROM channel_delivery_status WHERE updated_at<?").bind(cutoff),
  ]);
}

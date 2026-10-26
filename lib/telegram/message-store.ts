import type { SecurityDatabase, SecurityStatement } from "@/lib/worker-db";
import { sha256 } from "@/lib/security";
import { TELEGRAM_LEASE_MS } from "./outbox-rules";

export type MessageKind = "assignment" | "chat";
export type MessageLease = { kind: MessageKind; id: string; claim: string };
export type PreparedTelegram = { primary: Record<string, unknown>; fallback?: Record<string, unknown>; context: Record<string, unknown> };
const tables = { assignment: "telegram_assignment_payloads", chat: "telegram_chat_payloads" };
export const telegramMessageDdl = {
  assignment: `CREATE TABLE IF NOT EXISTS telegram_assignment_payloads (
    id TEXT PRIMARY KEY REFERENCES booking_notifications(id) ON DELETE CASCADE,
    payload_json TEXT, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
    next_attempt_at TEXT, provider_message_id INTEGER, last_error TEXT)`,
  chat: `CREATE TABLE IF NOT EXISTS telegram_chat_payloads (
    id TEXT PRIMARY KEY REFERENCES website_chat_messages(id) ON DELETE CASCADE,
    payload_json TEXT, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
    next_attempt_at TEXT, provider_message_id INTEGER, last_error TEXT)`,
};
export const telegramCardClaimDdl = `CREATE TABLE IF NOT EXISTS telegram_chat_card_claims (
  conversation_id TEXT PRIMARY KEY REFERENCES website_conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES website_chat_messages(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL, attempted_at TEXT NOT NULL)`;
export async function ensureTelegramMessages(db: SecurityDatabase, kind: MessageKind) {
  await db.batch([telegramMessageDdl[kind], ...(kind === "chat" ? [telegramCardClaimDdl] : [])].map(sql => db.prepare(sql)));
}
export function telegramMessageGuard(lease: MessageLease, fresh = false) {
  const cutoff = new Date(Date.now() - TELEGRAM_LEASE_MS / 2).toISOString();
  return lease.kind === "assignment" ? {
    sql: `EXISTS(SELECT 1 FROM booking_notifications WHERE id=? AND status='processing' AND last_attempt_at=? ${fresh ? "AND last_attempt_at>?" : ""})`,
    values: [lease.id, lease.claim, ...(fresh ? [cutoff] : [])],
  } : {
    sql: `EXISTS(SELECT 1 FROM website_chat_messages m JOIN telegram_chat_delivery_attempts a ON a.message_id=m.id WHERE m.id=? AND m.telegram_status='processing' AND a.claim_id=? ${fresh ? "AND a.attempted_at>?" : ""})`,
    values: [lease.id, lease.claim, ...(fresh ? [cutoff] : [])],
  };
}
export async function ownsTelegramMessage(db: SecurityDatabase, lease: MessageLease) {
  const guard = telegramMessageGuard(lease, true);
  const source = lease.kind === "assignment" ? "SELECT last_attempt_at attempted_at FROM booking_notifications WHERE id=?" : "SELECT attempted_at FROM telegram_chat_delivery_attempts WHERE message_id=?";
  const row = await db.prepare(`${source} AND ${guard.sql}`).bind(lease.id, ...guard.values).first<{ attempted_at: string }>();
  const age = row ? Date.now()-Date.parse(row.attempted_at) : Infinity;
  return age>=-5000 && age<TELEGRAM_LEASE_MS/2;
}
function validPrepared(value: unknown): value is PreparedTelegram {
  if (!value || typeof value !== "object") return false;
  const p = value as PreparedTelegram;
  const valid = (payload: unknown) => Boolean(payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).chat_id === "string" && typeof (payload as Record<string, unknown>).text === "string");
  return valid(p.primary) && (!p.fallback || valid(p.fallback)) && Boolean(p.context && typeof p.context === "object");
}
export async function readTelegramMessage(db: SecurityDatabase, kind: MessageKind, id: string) {
  const row = await db.prepare(`SELECT payload_json,content_hash FROM ${tables[kind]} WHERE id=?`).bind(id).first<{ payload_json: string | null; content_hash: string }>();
  if (!row) return null;
  if (!row.payload_json || await sha256(row.payload_json) !== row.content_hash) throw new Error("telegram_snapshot_invalid");
  let prepared: unknown;
  try { prepared = JSON.parse(row.payload_json); } catch { throw new Error("telegram_snapshot_invalid"); }
  if (!validPrepared(prepared)) throw new Error("telegram_snapshot_invalid");
  return prepared;
}
export async function freezeTelegramMessage(db: SecurityDatabase, lease: MessageLease, prepared: PreparedTelegram) {
  if (!validPrepared(prepared)) throw new Error("telegram_snapshot_invalid");
  const payload = JSON.stringify(prepared), guard = telegramMessageGuard(lease, true);
  await db.prepare(`INSERT OR IGNORE INTO ${tables[lease.kind]}(id,payload_json,content_hash,created_at) SELECT ?,?,?,? WHERE ${guard.sql}`)
    .bind(lease.id, payload, await sha256(payload), new Date().toISOString(), ...guard.values).run();
  return readTelegramMessage(db, lease.kind, lease.id);
}
export function telegramMessageOutcome(db: SecurityDatabase, lease: MessageLease, next: string | null, messageId: number | null, error: string | null): SecurityStatement {
  const guard = telegramMessageGuard(lease);
  return db.prepare(`UPDATE ${tables[lease.kind]} SET next_attempt_at=?,provider_message_id=COALESCE(?,provider_message_id),last_error=? WHERE id=? AND ${guard.sql}`)
    .bind(next, messageId, error, lease.id, ...guard.values);
}

export async function purgeTelegramMessages(db: SecurityDatabase, kind: MessageKind, now = new Date()) {
  await ensureTelegramMessages(db, kind);
  const sent = new Date(now.getTime()-7*86400000).toISOString(), terminal = new Date(now.getTime()-30*86400000).toISOString();
  const source = kind === "assignment"
    ? "SELECT p.id FROM telegram_assignment_payloads p JOIN booking_notifications n ON n.id=p.id WHERE p.payload_json IS NOT NULL AND ((n.status='sent' AND n.sent_at<?) OR (n.status IN ('uncertain','dead_letter','cancelled') AND n.updated_at<?)) LIMIT 100"
    : "SELECT p.id FROM telegram_chat_payloads p JOIN website_chat_messages m ON m.id=p.id LEFT JOIN telegram_chat_delivery_attempts a ON a.message_id=m.id WHERE p.payload_json IS NOT NULL AND ((m.telegram_status='sent' AND COALESCE(a.attempted_at,m.created_at)<?) OR (m.telegram_status IN ('uncertain','dead_letter','skipped') AND COALESCE(a.attempted_at,m.created_at)<?)) LIMIT 100";
  await db.prepare(`UPDATE ${tables[kind]} SET payload_json=NULL,next_attempt_at=NULL WHERE id IN (${source})`).bind(sent,terminal).run();
}

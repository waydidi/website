import type { SecurityDatabase } from "./worker-db";
import type { PreparedEmail } from "./email";
import type { EmailDelivery } from "./email-delivery-rules";
import { sha256, sha256Bytes } from "./security";
import { privateParts, joinPrivateParts } from "./private-bytes";

export const deliveryDdl = [
  `CREATE TABLE IF NOT EXISTS booking_delivery_payloads (
    delivery_id TEXT PRIMARY KEY REFERENCES booking_deliveries(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL,
    parts INTEGER NOT NULL CHECK(parts>0), size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
    created_at TEXT NOT NULL, first_attempt_at TEXT, send_attempts INTEGER NOT NULL DEFAULT 0,
    outcome_unknown INTEGER NOT NULL DEFAULT 0, provider_message_id TEXT, last_failure_code TEXT)`,
  `CREATE TABLE IF NOT EXISTS booking_delivery_payload_parts (
    snapshot_id TEXT NOT NULL REFERENCES booking_delivery_payloads(snapshot_id) ON DELETE CASCADE,
    part INTEGER NOT NULL CHECK(part>=0), data BLOB NOT NULL, PRIMARY KEY(snapshot_id,part))`,
];
export async function ensureDeliveryPayloads(db: SecurityDatabase) { await db.batch(deliveryDdl.map(sql => db.prepare(sql))); }
export function bookingDeliverySummary(db: SecurityDatabase, reference: string, at = new Date().toISOString()) {
  return db.prepare(`UPDATE bookings SET fulfillment_status=CASE WHEN EXISTS(
    SELECT 1 FROM booking_deliveries d WHERE d.booking_reference=bookings.reference AND d.status NOT IN ('sent','legacy_unknown')) THEN 'failed' ELSE 'complete' END,
    email_status=COALESCE((SELECT MAX(status) FROM booking_deliveries d WHERE d.booking_reference=bookings.reference AND d.channel='customer_email'),'pending'),updated_at=? WHERE reference=?`).bind(at,reference);
}
export const DELIVERY_LEASE_MS = 5 * 60000;
export const EMAIL_RETRY_WINDOW_MS = 23 * 3600000;
export const EMAIL_MAX_SEND_ATTEMPTS = 12;
export const DELIVERY_MAX_AGE_MS = 7 * 86400000;
export type DeliveryClaim = { id: string; attempted_at: string; attempts: number; created_at: string; last_error: string | null };
export type PayloadState = { snapshot_id: string; content_hash: string; parts: number; size_bytes: number; first_attempt_at: string | null; send_attempts: number; outcome_unknown: number };

/** A frozen message wins once, only while its producer still owns the lease. */
export async function freezeDeliveryEmail(db: SecurityDatabase, job: DeliveryClaim, prepared: PreparedEmail) {
  const envelope = { ...prepared, idempotencyKey: `booking-delivery:${await sha256(job.id)}` };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)), parts = privateParts(bytes);
  const snapshotId = crypto.randomUUID(), now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO booking_delivery_payloads(delivery_id,snapshot_id,content_hash,parts,size_bytes,created_at)
      SELECT id,?,?,?,?,? FROM booking_deliveries WHERE id=? AND status='processing' AND attempted_at=? AND attempted_at>?`)
      .bind(snapshotId, await sha256Bytes(bytes), parts.length, bytes.length, now, job.id, job.attempted_at, new Date(Date.now() - DELIVERY_LEASE_MS).toISOString()),
    ...parts.map((data, part) => db.prepare(`INSERT INTO booking_delivery_payload_parts(snapshot_id,part,data)
      SELECT snapshot_id,?,? FROM booking_delivery_payloads WHERE delivery_id=? AND snapshot_id=?`).bind(part, data, job.id, snapshotId)),
  ]);
}

export async function readDeliveryEmail(db: SecurityDatabase, id: string): Promise<{ prepared: PreparedEmail; state: PayloadState } | null> {
  const state = await db.prepare("SELECT * FROM booking_delivery_payloads WHERE delivery_id=?").bind(id).first<PayloadState>();
  if (!state) return null;
  const { results } = await db.prepare("SELECT part,data FROM booking_delivery_payload_parts WHERE snapshot_id=? ORDER BY part").bind(state.snapshot_id).all<{ part: number; data: ArrayBuffer | number[] }>();
  if (results.length !== state.parts || results.some((row, index) => row.part !== index)) throw new Error("delivery_snapshot_invalid");
  const bytes = joinPrivateParts(results.map(row => row.data));
  if (bytes.length !== state.size_bytes || await sha256Bytes(bytes) !== state.content_hash) throw new Error("delivery_snapshot_invalid");
  let prepared: PreparedEmail;
  try { prepared = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as PreparedEmail; }
  catch { throw new Error("delivery_snapshot_invalid"); }
  if (!prepared || typeof prepared.idempotencyKey !== "string" || !/^booking-delivery:[a-f0-9]{64}$/.test(prepared.idempotencyKey) || !prepared.payload || typeof prepared.payload !== "object" || typeof prepared.payload.from !== "string" || !prepared.payload.from) throw new Error("delivery_snapshot_invalid");
  return { prepared, state };
}

/** Persist the first possible provider attempt before any network activity. */
export async function beginDeliverySend(db: SecurityDatabase, job: DeliveryClaim, at = new Date()) {
  const now = at.toISOString();
  const previous = await db.prepare("SELECT * FROM booking_delivery_payloads WHERE delivery_id=?").bind(job.id).first<PayloadState>();
  if (!previous) return null;
  const state = await db.prepare(`UPDATE booking_delivery_payloads SET first_attempt_at=COALESCE(first_attempt_at,?),send_attempts=send_attempts+1,outcome_unknown=1,last_failure_code=NULL
    WHERE delivery_id=? AND send_attempts=? AND send_attempts<? AND (first_attempt_at IS NULL OR first_attempt_at>?)
    AND EXISTS(SELECT 1 FROM booking_deliveries d WHERE d.id=delivery_id AND d.status='processing' AND d.attempted_at=? AND d.attempted_at>? AND d.created_at>?) RETURNING *`)
    .bind(now, job.id, previous.send_attempts, EMAIL_MAX_SEND_ATTEMPTS, new Date(at.getTime() - EMAIL_RETRY_WINDOW_MS).toISOString(), job.attempted_at, new Date(at.getTime() - DELIVERY_LEASE_MS).toISOString(), new Date(at.getTime() - DELIVERY_MAX_AGE_MS).toISOString()).first<PayloadState>();
  return state ? { ...state, outcome_unknown: previous.outcome_unknown } : null;
}

export async function finishDeliverySend(db: SecurityDatabase, job: DeliveryClaim, delivery: EmailDelivery, state: PayloadState) {
  const now = new Date(), backoff = Math.min(6 * 3600000, 5 * 60000 * 2 ** Math.min(state.send_attempts - 1, 6));
  const next = now.getTime() + Math.max(backoff, delivery.retryAfterMs ?? 0);
  const unknown = Boolean(state.outcome_unknown || delivery.outcomeUnknown);
  const retryAllowed = delivery.retryable && state.send_attempts < EMAIL_MAX_SEND_ATTEMPTS && state.first_attempt_at && next < Date.parse(state.first_attempt_at) + EMAIL_RETRY_WINDOW_MS && next < Date.parse(job.created_at) + DELIVERY_MAX_AGE_MS;
  const status = delivery.status === "sent" ? "sent" : delivery.status === "pending_configuration" ? "pending_configuration" : retryAllowed ? "failed" : unknown ? "uncertain" : "dead_letter";
  const code = delivery.failureCode ?? null, at = now.toISOString();
  await db.batch([
    db.prepare(`UPDATE booking_delivery_payloads SET outcome_unknown=?,provider_message_id=COALESCE(?,provider_message_id),last_failure_code=?
      WHERE delivery_id=? AND EXISTS(SELECT 1 FROM booking_deliveries d WHERE d.id=delivery_id AND d.status='processing' AND d.attempted_at=?)`)
      .bind(unknown ? 1 : 0, delivery.providerMessageId ?? null, code, job.id, job.attempted_at),
    db.prepare("UPDATE booking_deliveries SET status=?,sent_at=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=? AND status='processing' AND attempted_at=?")
      .bind(status, status === "sent" ? at : null, ["failed", "pending_configuration"].includes(status) ? new Date(next).toISOString() : null, code, at, job.id, job.attempted_at),
  ]);
}

export async function closeDeliveryClaim(db: SecurityDatabase, job: DeliveryClaim, status: string, code: string) {
  const at = new Date().toISOString();
  await db.prepare("UPDATE booking_deliveries SET status=?,last_error=?,next_attempt_at=NULL,updated_at=? WHERE id=? AND status='processing' AND attempted_at=?").bind(status, code, at, job.id, job.attempted_at).run();
}

/** Purge private message bodies after review time; retain operational hashes/receipts. */
export async function purgeDeliveryPayloads(db: SecurityDatabase, at = new Date()) {
  await ensureDeliveryPayloads(db);
  await db.prepare(`DELETE FROM booking_delivery_payload_parts WHERE snapshot_id IN (
    SELECT p.snapshot_id FROM booking_delivery_payloads p JOIN booking_deliveries d ON d.id=p.delivery_id
    WHERE ((d.status='sent' AND d.sent_at<?) OR (d.status IN ('uncertain','dead_letter','legacy_unknown') AND d.updated_at<?))
      AND EXISTS(SELECT 1 FROM booking_delivery_payload_parts parts WHERE parts.snapshot_id=p.snapshot_id)
    ORDER BY p.created_at LIMIT 100)`)
    .bind(new Date(at.getTime()-7*86400000).toISOString(),new Date(at.getTime()-30*86400000).toISOString()).run();
}

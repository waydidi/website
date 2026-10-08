import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import { esc } from "./cards";
import { sendCard, telegramChatId, telegramConfigured, TelegramDeliveryError } from "./client";

// Uses the existing notification outbox. The queue row is committed with the assignment.
export function assignmentTelegramNotification(assignment: { id: string; bookingReference: string; assignedAt: string }) {
  return { id: crypto.randomUUID(), bookingReference: assignment.bookingReference, assignmentId: assignment.id,
    notificationType: "driver_assignment", channel: "telegram", recipient: telegramChatId(),
    dedupeKey: `telegram-driver-assignment:${assignment.id}`, scheduledFor: assignment.assignedAt,
    status: "queued", attemptCount: 0, createdAt: assignment.assignedAt, updatedAt: assignment.assignedAt };
}

type Job = { id: string; recipient: string; assignment_id: string; attempt_count: number };
type Assignment = { booking_reference: string; leg: string; driver_name: string; driver_phone: string | null;
  token_hash: string; driver_token: string; revoked_at: string | null; token_expires_at: string;
  booking_status: string; pickup: string; dropoff: string; pickup_date: string; pickup_time: string;
  return_pickup: string | null; return_dropoff: string | null; return_date: string | null; return_time: string | null };

export async function deliverAssignmentTelegram(assignmentId: string) {
  const db = env.DB as SecurityDatabase, now = new Date().toISOString();
  if (!telegramConfigured()) {
    await db.prepare("UPDATE booking_notifications SET error_message='Telegram bot token or destination missing',updated_at=? WHERE assignment_id=? AND channel='telegram' AND status IN ('queued','failed')").bind(now, assignmentId).run();
    return "queued";
  }
  const job = await db.prepare("SELECT id,recipient,assignment_id,attempt_count FROM booking_notifications WHERE assignment_id=? AND channel='telegram' AND status IN ('queued','failed') AND scheduled_for<=?").bind(assignmentId, now).first<Job>();
  if (!job) return "unchanged";
  // A destination change requires staff review rather than disclosing an old trip to another chat.
  if (job.recipient && job.recipient !== telegramChatId()) return "queued";
  const a = await db.prepare(`SELECT a.booking_reference,a.leg,a.token_hash,a.revoked_at,a.token_expires_at,
    d.full_name driver_name,d.phone driver_phone,l.driver_token,
    CASE WHEN b.status='confirmed' AND (j.status IS NULL OR j.status='pending_payment') THEN 'confirmed'
      WHEN b.status='confirmed' THEN j.status ELSE b.status END booking_status,b.pickup,b.dropoff,
    CASE WHEN a.leg='outbound' THEN COALESCE(j.pickup_date,b.pickup_date) ELSE b.pickup_date END pickup_date,
    CASE WHEN a.leg='outbound' THEN COALESCE(j.pickup_time,b.pickup_time) ELSE b.pickup_time END pickup_time,
    b.return_pickup,b.return_dropoff,
    CASE WHEN a.leg='return' THEN COALESCE(j.pickup_date,b.return_date) ELSE b.return_date END return_date,
    CASE WHEN a.leg='return' THEN COALESCE(j.pickup_time,b.return_time) ELSE b.return_time END return_time FROM booking_assignments a
    JOIN drivers d ON d.id=a.driver_id JOIN bookings b ON b.reference=a.booking_reference
    JOIN booking_links l ON l.booking_reference=a.booking_reference AND l.leg=a.leg
    LEFT JOIN journey_legs j ON j.booking_reference=a.booking_reference AND j.leg=a.leg WHERE a.id=?`).bind(assignmentId).first<Assignment>();
  if (!a || a.revoked_at || a.token_expires_at <= now || a.booking_status !== "confirmed" || await sha256(a.driver_token) !== a.token_hash) {
    await db.prepare("UPDATE booking_notifications SET status='cancelled',updated_at=?,error_message='Assignment or driver link is no longer active' WHERE id=? AND status IN ('queued','failed')").bind(now, job.id).run();
    return "cancelled";
  }
  const claimed = await db.prepare("UPDATE booking_notifications SET status='processing',attempt_count=attempt_count+1,last_attempt_at=?,updated_at=?,recipient=? WHERE id=? AND status IN ('queued','failed') AND scheduled_for<=? AND EXISTS(SELECT 1 FROM booking_assignments WHERE id=? AND revoked_at IS NULL AND token_hash=? AND token_expires_at>?)").bind(now, now, telegramChatId(), job.id, now, assignmentId, a.token_hash, now).run();
  if (!claimed.meta.changes) return "unchanged";
  const field = (value: unknown) => esc(String(value ?? "").slice(0, 500));
  const ret = a.leg === "return", link = `${SITE_URL}/driver/trip/${a.driver_token}`;
  const text = [`<b>Driver assigned</b> · ${esc(a.booking_reference)} · ${ret ? "Return" : "Outbound"}`,
    `Driver: ${field(a.driver_name)}${a.driver_phone ? ` · ${field(a.driver_phone)}` : ""}`,
    `Pickup: ${field(ret ? a.return_pickup || a.dropoff : a.pickup)}`,
    `Drop-off: ${field(ret ? a.return_dropoff || a.pickup : a.dropoff)}`,
    `Date/time (Thailand): ${esc(ret ? a.return_date : a.pickup_date)} ${esc(ret ? a.return_time : a.pickup_time)}`,
    `Driver link: ${link}`].join("\n");
  let status = "sent", error: string | null = null;
  try { await sendCard(text, [[{ text: "Open driver trip", url: link }]]); }
  catch (e) {
    status = e instanceof TelegramDeliveryError && e.retryable ? "failed" : "uncertain";
    error = e instanceof TelegramDeliveryError ? e.message : "Telegram delivery outcome unknown";
  }
  // Persist outside the send catch: a DB failure after acceptance must never trigger another send.
  const at = new Date().toISOString(), next = new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.min(job.attempt_count, 6)) * 1000).toISOString();
  await db.prepare("UPDATE booking_notifications SET status=?,error_message=?,sent_at=?,scheduled_for=?,updated_at=? WHERE id=? AND status='processing'").bind(status, error, status === "sent" ? at : null, next, at, job.id).run();
  return status;
}

export async function retryAssignmentTelegram(limit = 10) {
  const db = env.DB as SecurityDatabase, now = new Date().toISOString();
  // Interrupted sends have an unknown provider outcome. Never blindly repost them.
  await db.prepare("UPDATE booking_notifications SET status='uncertain',error_message='Interrupted send; check Telegram before retrying',updated_at=? WHERE channel='telegram' AND status='processing' AND last_attempt_at<?").bind(now, new Date(Date.now() - 120000).toISOString()).run();
  const rows = (await db.prepare("SELECT assignment_id FROM booking_notifications WHERE channel='telegram' AND notification_type='driver_assignment' AND status IN ('queued','failed') AND scheduled_for<=? ORDER BY scheduled_for LIMIT ?").bind(now, limit).all<{ assignment_id: string }>()).results;
  for (const row of rows) await deliverAssignmentTelegram(row.assignment_id);
}

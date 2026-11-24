import { env } from "cloudflare:workers";
import { ensureFoundationTables, logActivity } from "./activity-log";
import { isDeliveryStatus, nextDeliveryStatus, type DeliveryStatus, type MediaRef } from "./whatsapp-rules";

// WhatsApp webhook side effects other than the message text: media references and delivery statuses.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

/** Records a media reference once per media id (a webhook retry does not duplicate it). Nothing is downloaded. */
export async function recordWhatsappMedia(ref: MediaRef, channelMessageId: string, conversationId: string | null) {
  await ensureFoundationTables();
  const res = await db().prepare("INSERT INTO whatsapp_media(media_id,conversation_id,channel_message_id,kind,mime_type,sha256,received_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(media_id) DO NOTHING")
    .bind(ref.mediaId, conversationId, channelMessageId, ref.kind, ref.mimeType, ref.sha256, new Date().toISOString()).run();
  if (res.meta.changes) await logActivity({ event: "media_received", status: "ok", actor: "whatsapp", channel: "whatsapp", conversationId, dedupeKey: `wa-media:${ref.mediaId}`,
    summary: `Customer sent ${ref.kind}${ref.mimeType ? ` (${ref.mimeType})` : ""}; stored as a reference, not read yet`, detail: { kind: ref.kind, mimeType: ref.mimeType } });
}

/**
 * Stores a delivery status for a message we sent. Out-of-order and repeated events are absorbed by
 * nextDeliveryStatus: status only moves forward. Returns the stored status, or null if unchanged.
 */
export async function recordDeliveryStatus(channelMessageId: string, incoming: string, errorCode: string | null) {
  if (!isDeliveryStatus(incoming) || !/^[A-Za-z0-9._=:-]{1,200}$/.test(channelMessageId)) return null;
  await ensureFoundationTables();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db().prepare("SELECT status FROM channel_delivery_status WHERE channel_message_id=?").bind(channelMessageId).first<{ status: DeliveryStatus }>();
    const next = nextDeliveryStatus(row?.status ?? null, incoming);
    if (!next) return null;
    const now = new Date().toISOString(), code = errorCode?.slice(0, 40) ?? null;
    // Guarded on the status we read, so two concurrent webhooks cannot move it backwards.
    const res = row
      ? await db().prepare("UPDATE channel_delivery_status SET status=?,error_code=COALESCE(?,error_code),updated_at=? WHERE channel_message_id=? AND status=?").bind(next, code, now, channelMessageId, row.status).run()
      : await db().prepare("INSERT INTO channel_delivery_status(channel_message_id,channel,status,error_code,created_at,updated_at) VALUES(?,'whatsapp',?,?,?,?) ON CONFLICT(channel_message_id) DO NOTHING").bind(channelMessageId, next, code, now, now).run();
    if (!res.meta.changes) continue;
    if (next === "failed") {
      const owner = await db().prepare("SELECT conversation_id FROM website_chat_messages WHERE channel_message_id=? LIMIT 1").bind(channelMessageId).first<{ conversation_id: string }>().catch(() => null);
      await logActivity({ event: "send_failed", status: "error", actor: "whatsapp", channel: "whatsapp", conversationId: owner?.conversation_id ?? null, dedupeKey: `wa-failed:${channelMessageId}`,
        summary: `WhatsApp reported the message as failed${code ? ` (error ${code})` : ""}`, detail: { errorCode: code } });
    }
    return next;
  }
  return null;
}

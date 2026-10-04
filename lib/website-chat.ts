import { env } from "cloudflare:workers";
import { SITE_URL } from "@/lib/site";
import { editCard, sendCard, telegramConfigured } from "@/lib/telegram/client";
import { conversationCard, conversationKeyboard, customerMessage, staffEcho, type CardConversation, type ChatStatus } from "@/lib/telegram/cards";

// One canonical support conversation, stored in D1. The website widget, the admin inbox and Telegram
// are three views of the same rows; nothing is routed by name, only by conversation id.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };

export type Conversation = CardConversation & {
  token_hash: string; expires_at: string; customer_id: string | null; telegram_message_id: number | null;
  assigned_staff_id: string | null; assigned_telegram_user_id: string | null; last_message_at: string | null; updated_at: string;
};
export type ChatMessage = { id: string; sender: "visitor" | "staff"; sender_name: string | null; is_bot?: number; body: string; created_at: string; client_id: string | null; telegram_status: string | null };
export type Staffer = { name: string; staffId?: string | null; telegramUserId?: string | null };

export const STATUSES: ChatStatus[] = ["open", "pending", "closed"];
export const MESSAGE_COLUMNS = "id,sender,is_bot,COALESCE(sender_name,CASE WHEN sender='staff' THEN 'Waydidi team' END) sender_name,body,created_at,client_id,telegram_status";
const adminUrl = (id: string) => `${SITE_URL}/admin/chat?id=${encodeURIComponent(id)}`;
const nowIso = () => new Date().toISOString();

export const conversationById = (id: string) => db().prepare("SELECT * FROM website_conversations WHERE id=?").bind(id).first<Conversation>();
export const conversationByTokenHash = (hash: string) => db().prepare("SELECT * FROM website_conversations WHERE token_hash=? AND expires_at>?").bind(hash, nowIso()).first<Conversation>();

export async function createConversation(tokenHash: string, context: { customerId?: string | null; name?: string | null; email?: string | null; phone?: string | null; sourceUrl?: string | null; sourceTitle?: string | null; topic?: string | null; country?: string | null }) {
  const id = crypto.randomUUID(), now = nowIso();
  for (let attempt = 0; attempt < 4; attempt++) {
    // Display id only (e.g. WD-48213); it never grants access — the cookie token does.
    const publicId = `WD-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 90000 + 10000)}`;
    try {
      await db().prepare(`INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status,customer_id,customer_name,customer_email,customer_phone,source_url,source_title,topic,last_message_at,customer_country)
        VALUES(?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?,?)`).bind(id, tokenHash, new Date(Date.now() + 30 * 86400000).toISOString(), now, now, publicId,
        context.customerId ?? null, context.name ?? null, context.email ?? null, context.phone ?? null, context.sourceUrl ?? null, context.sourceTitle ?? null, context.topic ?? null, now, context.country ?? null).run();
      return (await conversationById(id))!;
    } catch (error) { if (!/UNIQUE/i.test(String(error)) || attempt === 3) throw error; }
  }
  throw new Error("CHAT_CREATE_FAILED");
}

export const messagesFor = (conversationId: string, afterRowid = 0, limit = 200) =>
  db().prepare(`SELECT rowid AS seq,${MESSAGE_COLUMNS} FROM website_chat_messages WHERE conversation_id=? AND rowid>? ORDER BY rowid DESC LIMIT ?`).bind(conversationId, afterRowid, limit).all<ChatMessage & { seq: number }>().then((r) => r.results.reverse());

/** Customer message. Saved first; Telegram delivery is attempted afterwards and never loses the message. */
export async function addVisitorMessage(c: Conversation, body: string, clientId: string | null) {
  const now = nowIso(), id = crypto.randomUUID();
  const inserted = await db().prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,client_id,telegram_status)
    VALUES(?,?,'visitor',?,?,?,?) ON CONFLICT(conversation_id,client_id) DO NOTHING`).bind(id, c.id, body, now, clientId, telegramConfigured() ? "pending" : null).run();
  if (!inserted.meta.changes) return { duplicate: true as const };
  // A new message reopens a closed conversation.
  await db().prepare("UPDATE website_conversations SET updated_at=?,last_message_at=?,status=CASE WHEN status='closed' THEN 'open' ELSE status END WHERE id=?").bind(now, now, c.id).run();
  await deliverVisitorMessage(c.id, id).catch(() => undefined);
  return { duplicate: false as const, id };
}

/** Sends (or re-sends) one customer message to Telegram. Safe to call again for messages that failed. */
export async function deliverVisitorMessage(conversationId: string, messageId: string) {
  if (!telegramConfigured()) return;
  const c = await conversationById(conversationId);
  const m = await db().prepare("SELECT body,created_at,telegram_status FROM website_chat_messages WHERE id=?").bind(messageId).first<{ body: string; created_at: string; telegram_status: string | null }>();
  if (!c || !m || m.telegram_status === "sent") return;
  try {
    let telegramId: number;
    if (!c.telegram_message_id) {
      const sent = await sendCard(conversationCard(c, { body: m.body, created_at: m.created_at, from: "visitor" }, true), conversationKeyboard(c, adminUrl(c.id)));
      telegramId = sent.message_id;
      await db().prepare("UPDATE website_conversations SET telegram_message_id=? WHERE id=? AND telegram_message_id IS NULL").bind(telegramId, c.id).run();
    } else {
      const sent = await sendCard(customerMessage(c.public_id, c.customer_name, m.body), undefined, c.telegram_message_id);
      telegramId = sent.message_id;
      await refreshCard(c.id).catch(() => undefined);
    }
    await db().prepare("UPDATE website_chat_messages SET telegram_status='sent',telegram_message_id=? WHERE id=?").bind(telegramId, messageId).run();
  } catch (error) {
    await db().prepare("UPDATE website_chat_messages SET telegram_status='failed' WHERE id=?").bind(messageId).run();
    console.error("telegram delivery failed", error instanceof Error ? error.message : "unknown");
    throw error;
  }
}

/** Retries customer messages whose Telegram delivery failed (called from the scheduled job). */
export async function retryFailedTelegram(limit = 20) {
  if (!telegramConfigured()) return 0;
  const rows = (await db().prepare("SELECT id,conversation_id FROM website_chat_messages WHERE sender='visitor' AND telegram_status IN ('failed','pending') AND created_at<? ORDER BY rowid LIMIT ?")
    .bind(new Date(Date.now() - 60000).toISOString(), limit).all<{ id: string; conversation_id: string }>()).results;
  let ok = 0;
  for (const r of rows) { try { await deliverVisitorMessage(r.conversation_id, r.id); ok++; } catch { /* stays failed for the next run */ } }
  return ok;
}

/**
 * Staff reply from the dashboard or Telegram. The first replier of an unassigned conversation becomes
 * its owner; an assigned conversation is never silently taken over.
 */
export async function addStaffMessage(conversationId: string, body: string, who: Staffer, origin: "dashboard" | "telegram", telegramMessageId?: number) {
  const c = await conversationById(conversationId);
  if (!c) return { error: "Conversation not found." };
  if (!c.assigned_name) await assign(c.id, who, false);
  await pauseBot(c.id, true); // a person is talking now; Cee stays quiet
  const now = nowIso(), id = crypto.randomUUID();
  await db().prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at,sender_name,telegram_message_id,telegram_status)
    VALUES(?,?,'staff',?,?,?,?,?,?)`).bind(id, c.id, body, who.staffId ?? null, now, who.name, telegramMessageId ?? null, origin === "telegram" ? "sent" : null).run();
  await db().prepare("UPDATE website_conversations SET updated_at=?,last_message_at=?,status=CASE WHEN status='closed' THEN 'open' ELSE status END WHERE id=?").bind(now, now, c.id).run();
  if (origin === "dashboard" && telegramConfigured() && c.telegram_message_id) {
    try {
      const sent = await sendCard(staffEcho(c.public_id, who.name, body), undefined, c.telegram_message_id);
      await db().prepare("UPDATE website_chat_messages SET telegram_status='sent',telegram_message_id=? WHERE id=?").bind(sent.message_id, id).run();
    } catch { await db().prepare("UPDATE website_chat_messages SET telegram_status='failed' WHERE id=?").bind(id).run(); }
  }
  await refreshCard(c.id).catch(() => undefined);
  return { id };
}

/** Cee's reply: shown as "Cee", never assigns the conversation, mirrored to Telegram. */
export async function addBotMessage(conversationId: string, body: string) {
  const c = await conversationById(conversationId);
  if (!c) return null;
  const now = nowIso(), id = crypto.randomUUID();
  await db().prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,sender_name,is_bot) VALUES(?,?,'staff',?,?,'Cee',1)`).bind(id, c.id, body, now).run();
  await db().prepare("UPDATE website_conversations SET updated_at=?,last_message_at=? WHERE id=?").bind(now, now, c.id).run();
  if (telegramConfigured() && c.telegram_message_id) {
    try {
      const sent = await sendCard(staffEcho(c.public_id, "Cee (bot)", body), undefined, c.telegram_message_id);
      await db().prepare("UPDATE website_chat_messages SET telegram_status='sent',telegram_message_id=? WHERE id=?").bind(sent.message_id, id).run();
    } catch { /* the website copy is what matters */ }
  }
  return id;
}

/** Stops (or resumes) Cee in one conversation. */
export async function pauseBot(conversationId: string, paused: boolean, state?: string) {
  await db().prepare("UPDATE website_conversations SET bot_paused=?,bot_state=COALESCE(?,bot_state) WHERE id=?").bind(paused ? 1 : 0, state ?? null, conversationId).run();
}

/** Assigns a conversation. With force=false it only claims an unassigned one. */
export async function assign(conversationId: string, who: Staffer, force: boolean) {
  const now = nowIso();
  const result = await db().prepare(`UPDATE website_conversations SET assigned_staff_id=?,assigned_telegram_user_id=?,assigned_name=?,assigned_at=?,updated_at=?
    WHERE id=? ${force ? "" : "AND assigned_name IS NULL"}`).bind(who.staffId ?? null, who.telegramUserId ?? null, who.name, now, now, conversationId).run();
  if (result.meta.changes) { await pauseBot(conversationId, true); await refreshCard(conversationId).catch(() => undefined); }
  return result.meta.changes > 0;
}

export async function setStatus(conversationId: string, status: ChatStatus) {
  const now = nowIso();
  const result = await db().prepare("UPDATE website_conversations SET status=?,updated_at=?,closed_at=CASE WHEN ?='closed' THEN ? ELSE closed_at END WHERE id=?").bind(status, now, status, now, conversationId).run();
  if (result.meta.changes) await refreshCard(conversationId).catch(() => undefined);
  return result.meta.changes > 0;
}

/** Re-renders the Telegram card so status and assignment stay in sync instead of posting duplicates. */
export async function refreshCard(conversationId: string) {
  if (!telegramConfigured()) return;
  const c = await conversationById(conversationId);
  if (!c?.telegram_message_id) return;
  const last = await db().prepare("SELECT sender,COALESCE(sender_name,'Waydidi team') name,body,created_at FROM website_chat_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 1").bind(c.id).first<{ sender: string; name: string; body: string; created_at: string }>();
  await editCard(c.telegram_message_id, conversationCard(c, last ? { body: last.body, created_at: last.created_at, from: last.sender === "visitor" ? "visitor" : last.name } : null, false), conversationKeyboard(c, adminUrl(c.id)));
}

/** Finds the conversation a Telegram reply belongs to: the card, any mirrored message, or a "Reply" prompt. */
export async function conversationForTelegramMessage(messageId: number) {
  const row = await db().prepare(`SELECT id FROM website_conversations WHERE telegram_message_id=?1
    UNION SELECT conversation_id FROM website_chat_messages WHERE telegram_message_id=?1
    UNION SELECT conversation_id FROM telegram_reply_prompts WHERE telegram_message_id=?1 LIMIT 1`).bind(messageId).first<{ id: string }>();
  return row?.id ?? null;
}

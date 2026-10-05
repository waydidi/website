import { env } from "cloudflare:workers";
import { SITE_URL } from "@/lib/site";
import { deliverToChannel } from "@/lib/channels";
import { editCard, sendCard, sendPrivate, telegramConfigured } from "@/lib/telegram/client";
import { conversationCard, conversationKeyboard, customerMessage, esc, staffEcho, type CardConversation, type ChatStatus } from "@/lib/telegram/cards";

// One canonical support conversation, stored in D1. The website widget, the admin inbox and Telegram
// are three views of the same rows; nothing is routed by name, only by conversation id.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };

export type Conversation = CardConversation & {
  token_hash: string; expires_at: string; customer_id: string | null; telegram_message_id: number | null;
  assigned_staff_id: string | null; assigned_telegram_user_id: string | null; last_message_at: string | null; updated_at: string;
  bot_paused?: number; bot_thinking_at?: string | null; channel?: string; channel_user_id?: string | null;
  bot_lock_until?: string | null; telegram_card_at?: string | null; line_reply_token?: string | null; line_reply_token_at?: string | null;
};
export type ChatMessage = { id: string; sender: "visitor" | "staff"; sender_name: string | null; is_bot?: number; card_json?: string | null; body: string; created_at: string; client_id: string | null; telegram_status: string | null };
export type Staffer = { name: string; staffId?: string | null; telegramUserId?: string | null };

export const STATUSES: ChatStatus[] = ["open", "pending", "closed"];
export const MESSAGE_COLUMNS = "id,sender,is_bot,card_json,COALESCE(sender_name,CASE WHEN sender='staff' THEN 'Waydidi team' END) sender_name,body,created_at,client_id,telegram_status";
const adminUrl = (id: string) => `${SITE_URL}/admin/chat?id=${encodeURIComponent(id)}`;
const nowIso = () => new Date().toISOString();

export const conversationById = (id: string) => db().prepare("SELECT * FROM website_conversations WHERE id=?").bind(id).first<Conversation>();
export const conversationByTokenHash = (hash: string) => db().prepare("SELECT * FROM website_conversations WHERE token_hash=? AND expires_at>?").bind(hash, nowIso()).first<Conversation>();

/** WD_chat_DDMMYYYYHHMM in Bangkok time. */
export function chatIdFor(iso: string) {
  const d = new Date(Date.parse(iso) + 7 * 3600_000), p = (n: number) => String(n).padStart(2, "0");
  return `WD_chat_${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${d.getUTCFullYear()}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

export async function createConversation(tokenHash: string, context: { customerId?: string | null; name?: string | null; email?: string | null; phone?: string | null; sourceUrl?: string | null; sourceTitle?: string | null; topic?: string | null; country?: string | null; channel?: string; channelUserId?: string | null }) {
  const id = crypto.randomUUID(), now = nowIso();
  for (let attempt = 0; attempt < 20; attempt++) {
    // Display id from the Bangkok start time, e.g. WD_chat_180820261024 = 18 Aug 2026, 10:24.
    // A second chat in the same minute gets _2, _3… It never grants access — the cookie token does.
    const publicId = `${chatIdFor(now)}${attempt ? `_${attempt + 1}` : ""}`;
    try {
      await db().prepare(`INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status,customer_id,customer_name,customer_email,customer_phone,source_url,source_title,topic,last_message_at,customer_country,channel,channel_user_id)
        VALUES(?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?,?,?,?)`).bind(id, tokenHash, new Date(Date.now() + 30 * 86400000).toISOString(), now, now, publicId,
        context.customerId ?? null, context.name ?? null, context.email ?? null, context.phone ?? null, context.sourceUrl ?? null, context.sourceTitle ?? null, context.topic ?? null, now, context.country ?? null, context.channel ?? "web", context.channelUserId ?? null).run();
      return (await conversationById(id))!;
    } catch (error) { if (!/UNIQUE/i.test(String(error)) || attempt === 19) throw error; }
  }
  throw new Error("CHAT_CREATE_FAILED");
}

export const messagesFor = (conversationId: string, afterRowid = 0, limit = 200) =>
  db().prepare(`SELECT rowid AS seq,${MESSAGE_COLUMNS} FROM website_chat_messages WHERE conversation_id=? AND rowid>? ORDER BY rowid ${afterRowid > 0 ? "ASC" : "DESC"} LIMIT ?`).bind(conversationId, afterRowid, limit).all<ChatMessage & { seq: number }>().then((r) => afterRowid > 0 ? r.results : r.results.reverse());

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
  // Assigned chats go to the assignee's private chat with the bot; the group only if that fails.
  const dm = c.assigned_name ? await assigneeTelegramId(c) : null;
  if (dm) {
    try {
      // Private chat reads like a normal one-to-one conversation: just the customer's words.
      const sent = await sendPrivate(dm, esc(m.body.slice(0, 4000)));
      await rememberPrivate(dm, sent.message_id, c.id);
      await db().prepare("UPDATE website_chat_messages SET telegram_status='sent' WHERE id=?").bind(messageId).run();
      return;
    } catch { /* not started with the bot, or blocked: fall back to the group */ }
  }
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
  if (!c || c.expires_at <= nowIso()) return { error: "Conversation expired or unavailable." };
  const clientId = origin === "telegram" && telegramMessageId != null ? `telegram:${telegramMessageId}` : null;
  if (clientId) {
    const existing = await db().prepare("SELECT id FROM website_chat_messages WHERE conversation_id=? AND client_id=?").bind(c.id, clientId).first<{ id: string }>();
    if (existing) return { id: existing.id };
  }
  if (!c.assigned_name) await assign(c.id, who, false);
  const now = nowIso(), id = crypto.randomUUID();
  // Check ownership in the insert itself: assignment can change between requests.
  const inserted = await db().prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at,sender_name,telegram_message_id,telegram_status,client_id)
    SELECT ?,?,'staff',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM website_conversations WHERE id=? AND expires_at>? AND ((? IS NOT NULL AND assigned_staff_id=?) OR (? IS NOT NULL AND assigned_telegram_user_id=?)))
    ON CONFLICT(conversation_id,client_id) DO NOTHING`).bind(id, c.id, body, who.staffId ?? null, now, who.name, telegramMessageId ?? null, origin === "telegram" ? "sent" : null, clientId,
      c.id, now, who.staffId ?? null, who.staffId ?? null, who.telegramUserId ?? null, who.telegramUserId ?? null).run();
  if (!inserted.meta.changes) {
    if (clientId) {
      const duplicate = await db().prepare("SELECT id FROM website_chat_messages WHERE conversation_id=? AND client_id=?").bind(c.id, clientId).first<{ id: string }>();
      if (duplicate) return { id: duplicate.id };
    }
    return { error: "Another admin is handling this chat. Assign it to yourself before replying." };
  }
  await pauseBot(c.id, true); // a person is talking now; Non stays quiet
  await db().prepare("UPDATE website_conversations SET updated_at=?,last_message_at=?,status=CASE WHEN status='closed' THEN 'open' ELSE status END WHERE id=?").bind(now, now, c.id).run();
  await toChannel(c, id, body);
  if (origin === "dashboard" && telegramConfigured() && c.telegram_message_id) {
    try {
      const sent = await sendCard(staffEcho(c.public_id, who.name, body), undefined, c.telegram_message_id);
      await db().prepare("UPDATE website_chat_messages SET telegram_status='sent',telegram_message_id=? WHERE id=?").bind(sent.message_id, id).run();
    } catch { await db().prepare("UPDATE website_chat_messages SET telegram_status='failed' WHERE id=?").bind(id).run(); }
  }
  await refreshCard(c.id).catch(() => undefined);
  return { id };
}

/** Non's reply: shown as "Non", never assigns the conversation, mirrored to Telegram. */
export async function addBotMessage(conversationId: string, body: string, card?: object | null) {
  const c = await conversationById(conversationId);
  if (!c) return null;
  const now = nowIso(), id = crypto.randomUUID();
  await db().prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,sender_name,is_bot,card_json) VALUES(?,?,'staff',?,?,'Non',1,?)`).bind(id, c.id, body, now, card ? JSON.stringify(card) : null).run();
  await db().prepare("UPDATE website_conversations SET updated_at=?,last_message_at=? WHERE id=?").bind(now, now, c.id).run();
  await toChannel(c, id, body);
  // Not copied to Telegram: the staff group gets customer messages and handovers only (Telegram's group limit).
  return id;
}

/** WhatsApp/LINE copy of a reply. A failure is noted on the message, never lost on the website. */
async function toChannel(c: Conversation, messageId: string, body: string) {
  if (!c.channel || c.channel === "web") return;
  try {
    let token: string | null = null;
    if (c.channel === "line") {
      // Claim the customer's latest reply token once (atomic), if it is still fresh.
      const fresh = new Date(Date.now() - 50000).toISOString();
      const row = await db().prepare("SELECT line_reply_token t FROM website_conversations WHERE id=? AND line_reply_token IS NOT NULL AND line_reply_token_at>?").bind(c.id, fresh).first<{ t: string }>();
      if (row && (await db().prepare("UPDATE website_conversations SET line_reply_token=NULL WHERE id=? AND line_reply_token=?").bind(c.id, row.t).run()).meta.changes) token = row.t;
    }
    const sentId = await deliverToChannel(c.channel, c.channel_user_id, body, token);
    await db().prepare("UPDATE website_chat_messages SET channel_message_id=COALESCE(?,'sent') WHERE id=?").bind(sentId, messageId).run();
  } catch (error) {
    await db().prepare("UPDATE website_chat_messages SET channel_message_id='failed' WHERE id=?").bind(messageId).run();
    console.error("channel delivery failed", error instanceof Error ? error.message : "unknown");
  }
}

/** Marks Non as working on a reply, so the website can show "Non is typing…". */
export const setBotThinking = (conversationId: string, on: boolean) =>
  db().prepare("UPDATE website_conversations SET bot_thinking_at=? WHERE id=?").bind(on ? nowIso() : null, conversationId).run();

/** Keeps LINE's free reply token for the customer's newest message. */
export const saveLineReplyToken = (conversationId: string, token: string) =>
  db().prepare("UPDATE website_conversations SET line_reply_token=?,line_reply_token_at=? WHERE id=?").bind(token, nowIso(), conversationId).run();

/** Latest WhatsApp/LINE conversation for this customer (reopened by a new message). */
export const conversationForChannelUser = (channel: string, userId: string) =>
  db().prepare("SELECT * FROM website_conversations WHERE channel=? AND channel_user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(channel, userId, nowIso()).first<Conversation>();

/** Stops (or resumes) Non in one conversation. */
export async function pauseBot(conversationId: string, paused: boolean, state?: string) {
  await db().prepare("UPDATE website_conversations SET bot_paused=?,bot_state=COALESCE(?,bot_state) WHERE id=?").bind(paused ? 1 : 0, state ?? null, conversationId).run();
}

/** The assignee's Telegram ID: set when assigned from Telegram, or linked to their admin login. */
export async function assigneeTelegramId(c: Conversation) {
  if (c.assigned_telegram_user_id) return c.assigned_telegram_user_id;
  if (!c.assigned_staff_id) return null;
  const row = await db().prepare("SELECT telegram_user_id FROM telegram_admins WHERE staff_id=? AND enabled=1 LIMIT 1").bind(c.assigned_staff_id).first<{ telegram_user_id: string }>();
  return row?.telegram_user_id ?? null;
}
const rememberPrivate = (chatId: string, messageId: number, conversationId: string) =>
  db().prepare("INSERT OR IGNORE INTO telegram_dm_messages(chat_id,message_id,conversation_id,created_at) VALUES(?,?,?,?)").bind(chatId, messageId, conversationId, nowIso()).run();

/** Which chat a private message answers: the one it replies to, else the latest one sent to this person. */
export async function conversationForPrivateMessage(chatId: string, replyToId: number | null) {
  if (replyToId) {
    const r = await db().prepare("SELECT conversation_id FROM telegram_dm_messages WHERE chat_id=? AND message_id=?").bind(chatId, replyToId).first<{ conversation_id: string }>();
    if (r) return r.conversation_id;
  }
  const latest = await db().prepare("SELECT conversation_id FROM telegram_dm_messages WHERE chat_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(chatId).first<{ conversation_id: string }>();
  return latest?.conversation_id ?? null;
}

/** "Chat WD-… has been assigned to …" in the group, and the chat so far in the assignee's private chat. */
async function announceAssignment(conversationId: string) {
  if (!telegramConfigured()) return;
  const c = await conversationById(conversationId);
  if (!c?.assigned_name) return;
  const name = c.assigned_name.replace(/[<>&]/g, "");
  await sendCard(`Chat <b>${c.public_id}</b> has been assigned to <b>${name}</b>.`, undefined, c.telegram_message_id ?? undefined).catch(() => undefined);
  const dm = await assigneeTelegramId(c);
  if (!dm) return;
  const recent = (await messagesFor(c.id, 0, 6)).map((m) => `${m.sender === "visitor" ? "Customer" : (m.sender_name ?? "Waydidi").replace(/[<>&]/g, "")}: ${m.body.replace(/[<>&]/g, "").slice(0, 300)}`).join("\n");
  try {
    const sent = await sendPrivate(dm, `<b>${c.public_id}</b> is yours · ${(c.customer_name ?? "Website visitor").replace(/[<>&]/g, "")}\n\n${recent}\n\n<i>New messages from this customer will come here. Just type to answer.</i>`);
    await rememberPrivate(dm, sent.message_id, c.id);
  } catch {
    await sendCard(`Couldn't message <b>${name}</b> privately. Open the Waydidi bot and tap <b>Start</b> once; until then this chat's messages stay in the group.`, undefined, c.telegram_message_id ?? undefined).catch(() => undefined);
  }
}

/** Assigns a conversation. With force=false it only claims an unassigned one. */
export async function assign(conversationId: string, who: Staffer, force: boolean) {
  const now = nowIso();
  const result = await db().prepare(`UPDATE website_conversations SET assigned_staff_id=?,assigned_telegram_user_id=?,assigned_name=?,assigned_at=?,updated_at=?
    WHERE id=? ${force ? "" : "AND assigned_name IS NULL"}`).bind(who.staffId ?? null, who.telegramUserId ?? null, who.name, now, now, conversationId).run();
  if (result.meta.changes) { await pauseBot(conversationId, true); await refreshCard(conversationId, true).catch(() => undefined); await announceAssignment(conversationId).catch(() => undefined); }
  return result.meta.changes > 0;
}

export async function setStatus(conversationId: string, status: ChatStatus) {
  const now = nowIso();
  const result = await db().prepare("UPDATE website_conversations SET status=?,updated_at=?,closed_at=CASE WHEN ?='closed' THEN ? ELSE closed_at END WHERE id=?").bind(status, now, status, now, conversationId).run();
  if (result.meta.changes) await refreshCard(conversationId, true).catch(() => undefined);
  return result.meta.changes > 0;
}

/** Re-renders the Telegram card so status and assignment stay in sync instead of posting duplicates. */
export async function refreshCard(conversationId: string, force = false) {
  if (!telegramConfigured()) return;
  const c = await conversationById(conversationId);
  if (!c?.telegram_message_id) return;
  // New messages already arrive as replies under the card, so the card itself is refreshed at most
  // every 30 s for them; status and assignment changes (force) update it straight away.
  const now = Date.now();
  if (!force && c.telegram_card_at && now - Date.parse(c.telegram_card_at) < 30000) return;
  await db().prepare("UPDATE website_conversations SET telegram_card_at=? WHERE id=?").bind(new Date(now).toISOString(), c.id).run();
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

import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/security";
import { answerCallback, sendCard, telegramChatId, type TelegramMessage, type TelegramUser } from "@/lib/telegram/client";
import { esc } from "@/lib/telegram/cards";
import { acknowledgeBooking } from "@/lib/telegram/bookings";
import { addStaffMessage, assign, conversationById, conversationForTelegramMessage, setStatus } from "@/lib/website-chat";

// Telegram → Waydidi. Verified by the secret-token header, de-duplicated by update_id, and every action
// is checked against the approved Telegram admin list. Callback data is only a hint; it is re-validated here.

type Update = { update_id: number; message?: TelegramMessage; callback_query?: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage } };
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as { prepare: (sql: string) => Stmt };
const ok = () => NextResponse.json({ ok: true });

async function approved(user: TelegramUser | undefined) {
  if (!user || user.is_bot) return null;
  return db().prepare("SELECT display_name,staff_id FROM telegram_admins WHERE telegram_user_id=? AND enabled=1").bind(String(user.id)).first<{ display_name: string; staff_id: string | null }>();
}

export async function POST(request: Request) {
  const secret = String(env.TELEGRAM_WEBHOOK_SECRET ?? "");
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (secret.length < 16 || !constantTimeEqual(given, secret)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const update = await request.json().catch(() => null) as Update | null;
  if (!update || typeof update.update_id !== "number") return ok();

  // Telegram retries deliveries; the first insert wins and repeats are acknowledged without side effects.
  const fresh = await db().prepare("INSERT INTO telegram_events(update_id,event_type,processing_status,processed_at) VALUES(?,?,'received',?) ON CONFLICT(update_id) DO NOTHING")
    .bind(update.update_id, update.callback_query ? "callback" : update.message ? "message" : "other", new Date().toISOString()).run();
  if (!fresh.meta.changes) return ok();

  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
    await db().prepare("UPDATE telegram_events SET processing_status='done' WHERE update_id=?").bind(update.update_id).run();
  } catch (error) {
    await db().prepare("UPDATE telegram_events SET processing_status='failed' WHERE update_id=?").bind(update.update_id).run();
    console.error("telegram webhook failed", error instanceof Error ? error.message : "unknown");
  }
  return ok();
}

async function handleCallback(q: NonNullable<Update["callback_query"]>) {
  if (String(q.message?.chat.id ?? "") !== telegramChatId()) return answerCallback(q.id, "This chat isn't connected to Waydidi.", true);
  const admin = await approved(q.from);
  if (!admin) return answerCallback(q.id, `You're not on the Waydidi Telegram team yet. Ask the owner to add your Telegram ID: ${q.from.id}`, true);
  const [action, target] = (q.data ?? "").split(":");
  if (!target || target.length > 60) return answerCallback(q.id, "Unknown action.");
  const who = { name: admin.display_name, staffId: admin.staff_id, telegramUserId: String(q.from.id) };

  if (action === "booking_assign") {
    const done = await acknowledgeBooking(target, admin.display_name);
    return answerCallback(q.id, done ? "Booking is yours." : "Someone already took this booking.");
  }
  const c = await conversationById(target);
  if (!c) return answerCallback(q.id, "That conversation no longer exists.", true);
  switch (action) {
    case "chat_assign": {
      const done = await assign(c.id, who, false);
      return answerCallback(q.id, done ? "Assigned to you." : `Already assigned to ${c.assigned_name}.`);
    }
    case "chat_pending": await setStatus(c.id, "pending"); return answerCallback(q.id, "Marked pending.");
    case "chat_open": await setStatus(c.id, "open"); return answerCallback(q.id, "Marked open.");
    case "chat_close": await setStatus(c.id, "closed"); return answerCallback(q.id, "Closed.");
    case "chat_reopen": await setStatus(c.id, "open"); return answerCallback(q.id, "Reopened.");
    case "chat_reply": {
      const prompt = await sendCard(`✍️ Reply to <b>${esc(c.public_id)}</b> · ${esc(c.customer_name || "Website visitor")}\n<i>Write your answer as a reply to this message.</i>`, undefined, c.telegram_message_id ?? undefined);
      await db().prepare("INSERT OR IGNORE INTO telegram_reply_prompts(telegram_message_id,conversation_id,created_at) VALUES(?,?,?)").bind(prompt.message_id, c.id, new Date().toISOString()).run();
      return answerCallback(q.id);
    }
    default: return answerCallback(q.id, "Unknown action.");
  }
}

async function handleMessage(m: TelegramMessage) {
  if (String(m.chat.id) !== telegramChatId()) return;
  const text = (m.text ?? "").trim();
  if (text === "/id" || text.startsWith("/id@")) {
    await sendCard(`Your Telegram ID is <code>${m.from?.id ?? "unknown"}</code>. Ask the Waydidi owner to add it under Admin → Chat → Telegram team.`, undefined, m.message_id);
    return;
  }
  // Only replies to a Waydidi card or prompt are customer answers; normal group talk is ignored.
  if (!m.reply_to_message || !text) return;
  const conversationId = await conversationForTelegramMessage(m.reply_to_message.message_id);
  if (!conversationId) return;
  const admin = await approved(m.from);
  if (!admin) {
    await sendCard(`⚠️ Not sent to the customer: you're not on the Waydidi Telegram team. Your Telegram ID is <code>${m.from?.id ?? "unknown"}</code>.`, undefined, m.message_id);
    return;
  }
  if (text.length > 2000) { await sendCard("⚠️ Not sent: replies can be up to 2,000 characters.", undefined, m.message_id); return; }
  const result = await addStaffMessage(conversationId, text, { name: admin.display_name, staffId: admin.staff_id, telegramUserId: String(m.from!.id) }, "telegram", m.message_id);
  if ("error" in result) await sendCard(`⚠️ ${esc(result.error)}`, undefined, m.message_id);
}

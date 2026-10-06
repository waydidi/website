import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/security";
import { answerCallback, sendCard, sendPrivate, telegramChatId, tg, type TelegramMessage, type TelegramUser } from "@/lib/telegram/client";
import { esc, pickKeyboard } from "@/lib/telegram/cards";
import { acknowledgeBooking, refreshBookingCard } from "@/lib/telegram/bookings";
import { askBookingQuestion, driverChoices, handleBookingAnswer, pickDriver } from "@/lib/telegram/booking-tasks";
import { waitHandover } from "@/lib/telegram/handover";
import { approveChange, cancelBookingFromTelegram, declineChange, keepBooking } from "@/lib/telegram/booking-changes";
import { addStaffMessage, assign, conversationById, conversationForPrivateMessage, conversationForTelegramMessage, refreshCard, setStatus } from "@/lib/website-chat";

// Telegram → Waydidi. Verified by the secret-token header, de-duplicated by update_id, and every action
// is checked against the approved Telegram admin list. Callback data is only a hint; it is re-validated here.

type Update = { update_id: number; message?: TelegramMessage; callback_query?: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage } };
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
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

  // Claim failed deliveries again; an in-flight delivery has a five-minute lease.
  const fresh = await db().prepare(`INSERT INTO telegram_events(update_id,event_type,processing_status,processed_at) VALUES(?,?,'received',?)
    ON CONFLICT(update_id) DO UPDATE SET processing_status='received',processed_at=excluded.processed_at
    WHERE telegram_events.processing_status='failed' OR (telegram_events.processing_status='received' AND telegram_events.processed_at<?)`)
    .bind(update.update_id, update.callback_query ? "callback" : update.message ? "message" : "other", new Date().toISOString(), new Date(Date.now()-5*60000).toISOString()).run();
  if (!fresh.meta.changes) {
    const existing = await db().prepare("SELECT processing_status FROM telegram_events WHERE update_id=?").bind(update.update_id).first<{processing_status:string}>();
    return existing?.processing_status === "done" ? ok() : NextResponse.json({error:"Delivery is still processing."},{status:503});
  }

  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
    await db().prepare("UPDATE telegram_events SET processing_status='done' WHERE update_id=?").bind(update.update_id).run();
  } catch (error) {
    await db().prepare("UPDATE telegram_events SET processing_status='failed' WHERE update_id=?").bind(update.update_id).run();
    console.error("telegram webhook failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({error:"Delivery failed. Please retry."},{status:503});
  }
  return ok();
}

async function handleCallback(q: NonNullable<Update["callback_query"]>) {
  if (String(q.message?.chat.id ?? "") !== telegramChatId()) return answerCallback(q.id, "This chat isn't connected to Waydidi.", true);
  const admin = await approved(q.from);
  if (!admin) return answerCallback(q.id, `You're not on the Waydidi Telegram team yet. Ask the owner to add your Telegram ID: ${q.from.id}`, true);
  const [action, target, extra] = (q.data ?? "").split(":");
  if (!target || target.length > 60) return answerCallback(q.id, "Unknown action.");
  const who = { name: admin.display_name, staffId: admin.staff_id, telegramUserId: String(q.from.id) };

  if (action === "bk_cost" || action === "bk_drv") {
    const taken = await db().prepare("SELECT acknowledged_by FROM telegram_booking_cards WHERE booking_reference=?").bind(target).first<{ acknowledged_by: string | null }>();
    if (!taken?.acknowledged_by) return answerCallback(q.id, "Assign the booking first.", true);
    await askBookingQuestion(target, action === "bk_cost" ? "cost" : "driver_name", q.from);
    return answerCallback(q.id, action === "bk_cost" ? "Type the driver cost." : "Answer the driver questions one by one.");
  }
  if (action === "bk_dl" || action === "bk_dp" || action === "bk_dx") {
    const card = await db().prepare("SELECT acknowledged_by,driver_done FROM telegram_booking_cards WHERE booking_reference=?").bind(target).first<{ acknowledged_by: string | null; driver_done: number }>();
    if (!card?.acknowledged_by) return answerCallback(q.id, "Assign the booking first.", true);
    if (card.driver_done) { await refreshBookingCard(target); return answerCallback(q.id, "A driver is already set.", true); }
    if (action === "bk_dx") { await refreshBookingCard(target); return answerCallback(q.id); }
    if (action === "bk_dl") {
      const drivers = await driverChoices();
      if (!drivers.length) return answerCallback(q.id, "No active drivers yet. Use Add outsource driver.", true);
      const rows = drivers.map((d) => [{ text: d.full_name.slice(0, 40), callback_data: `bk_dp:${target}:${d.id}` }]);
      await tg("editMessageReplyMarkup", { chat_id: q.message!.chat.id, message_id: q.message!.message_id, reply_markup: { inline_keyboard: [...rows, [{ text: "Back", callback_data: `bk_dx:${target}` }]] } }).catch(() => undefined);
      return answerCallback(q.id, "Choose a driver.");
    }
    const picked = extra ? await pickDriver(target, extra, admin.display_name, refreshBookingCard) : false;
    return answerCallback(q.id, picked ? "Driver assigned." : "That driver isn't available.", !picked);
  }
  if (action === "noop") return answerCallback(q.id);
  if (action === "bk_cancel") return answerCallback(q.id, await cancelBookingFromTelegram(target, admin.display_name), true);
  if (action === "bk_keep") return answerCallback(q.id, await keepBooking(target, admin.display_name), true);
  if (action === "chg_ok") return answerCallback(q.id, await approveChange(target, admin.display_name), true);
  if (action === "chg_no") return answerCallback(q.id, await declineChange(target, admin.display_name), true);
  if (action === "booking_assign") {
    const done = await acknowledgeBooking(target, admin.display_name);
    return answerCallback(q.id, done ? "Booking is yours." : "Someone already took this booking.");
  }
  const c = await conversationById(target);
  if (!c) return answerCallback(q.id, "That conversation no longer exists.", true);
  switch (action) {
    case "chat_assign": {
      const done = await assign(c.id, who, false);
      // On a "Needs a person" card: drop its buttons and say who took it.
      if (q.message && q.message.message_id !== c.telegram_message_id) await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: done ? `Taken by ${admin.display_name}` : `Taken by ${c.assigned_name}`, callback_data: "noop:x" }]] } }).catch(() => undefined);
      return answerCallback(q.id, done ? "Assigned to you." : `Already assigned to ${c.assigned_name}.`);
    }
    case "chat_wait": return answerCallback(q.id, await waitHandover(c.id, admin.display_name), true);
    case "chat_pending": await setStatus(c.id, "pending"); return answerCallback(q.id, "Marked pending.");
    case "chat_open": await setStatus(c.id, "open"); return answerCallback(q.id, "Marked open.");
    case "chat_close": await setStatus(c.id, "closed"); return answerCallback(q.id, "Closed.");
    case "chat_reopen": await setStatus(c.id, "open"); return answerCallback(q.id, "Reopened.");
    // "Let other assign": show the team as buttons on this card; "ct" assigns the one picked.
    case "chat_pick": {
      const team = (await db().prepare("SELECT telegram_user_id,display_name FROM telegram_admins WHERE enabled=1 ORDER BY display_name LIMIT 20").all<{ telegram_user_id: string; display_name: string }>()).results;
      if (!team.length) return answerCallback(q.id, "Add people under Admin → Website chat → Telegram team first.", true);
      if (q.message) await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: pickKeyboard(c.id, team) } }).catch(() => undefined);
      return answerCallback(q.id, "Choose who should take this chat.");
    }
    case "ct": {
      const member = await db().prepare("SELECT telegram_user_id,display_name,staff_id FROM telegram_admins WHERE telegram_user_id=? AND enabled=1").bind(extra ?? "").first<{ telegram_user_id: string; display_name: string; staff_id: string | null }>();
      if (!member) return answerCallback(q.id, "That person isn't on the team any more.", true);
      await assign(c.id, { name: member.display_name, staffId: member.staff_id, telegramUserId: member.telegram_user_id }, true);
      return answerCallback(q.id, `Assigned to ${member.display_name}.`);
    }
    case "chat_cancel": await refreshCard(c.id, true).catch(() => undefined); return answerCallback(q.id);
    case "chat_reply": {
      // force_reply opens Telegram's reply box on the tapper's phone, so the answer is linked to this chat.
      const hi = q.from?.first_name ? ` ${esc(q.from.first_name)},` : "";
      const prompt = await tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), parse_mode: "HTML",
        text: `${hi} type your answer to <b>${esc(c.public_id)}</b> · ${esc(c.customer_name || "Website visitor")} and send it.`,
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: `Answer ${c.public_id}` },
        ...(c.telegram_message_id ? { reply_parameters: { message_id: c.telegram_message_id, allow_sending_without_reply: true } } : {}) });
      await db().prepare("INSERT OR IGNORE INTO telegram_reply_prompts(telegram_message_id,conversation_id,created_at,telegram_user_id) VALUES(?,?,?,?)").bind(prompt.message_id, c.id, new Date().toISOString(), q.from ? String(q.from.id) : null).run();
      return answerCallback(q.id);
    }
    default: return answerCallback(q.id, "Unknown action.");
  }
}

async function handlePrivate(m: TelegramMessage) {
  const text = (m.text ?? "").trim(), chatId = String(m.chat.id);
  const admin = await approved(m.from);
  if (text === "/start" || text.startsWith("/start ")) {
    await sendPrivate(chatId, admin ? `Hi ${esc(admin.display_name)}. Chats assigned to you will arrive here. Just type to answer the customer.` : `Hi! Your Telegram ID is <code>${m.from?.id ?? "unknown"}</code>. Ask the Waydidi owner to add you to the Telegram team.`).catch(() => undefined);
    return;
  }
  if (!admin || !text || text.startsWith("/")) return;
  const conversationId = await conversationForPrivateMessage(chatId, m.reply_to_message?.message_id ?? null);
  if (!conversationId) { await sendPrivate(chatId, "No chat to answer yet. Chats assigned to you will appear here.").catch(() => undefined); return; }
  if (text.length > 2000) { await sendPrivate(chatId, "Not sent: replies can be up to 2,000 characters.", m.message_id).catch(() => undefined); return; }
  const result = await addStaffMessage(conversationId, text, { name: admin.display_name, staffId: admin.staff_id, telegramUserId: String(m.from!.id) }, "telegram");
  // Normal one-to-one feel: no "sent" receipts, only a note if something went wrong.
  if ("error" in result) await sendPrivate(chatId, `Not sent: ${esc(result.error ?? "")}`, m.message_id).catch(() => undefined);
}

async function handleMessage(m: TelegramMessage) {
  const text0 = (m.text ?? "").trim();
  // Setup helper: before TELEGRAM_CHAT_ID is set, /chatid in a group answers with that group's ID.
  if (!telegramChatId() && (text0 === "/chatid" || text0.startsWith("/chatid@"))) {
    await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
      text: `This group's chat ID is <code>${m.chat.id}</code>. Add it in Cloudflare as TELEGRAM_CHAT_ID.` }).catch(() => undefined);
    return;
  }
  // Private chat with the bot: the assignee answers their chats here.
  if (m.chat.type === "private") { await handlePrivate(m); return; }
  if (String(m.chat.id) !== telegramChatId()) return;
  const text = (m.text ?? "").trim();
  if (text === "/id" || text.startsWith("/id@")) {
    await sendCard(`Your Telegram ID is <code>${m.from?.id ?? "unknown"}</code>. Ask the Waydidi owner to add it under Admin → Chat → Telegram team.`, undefined, m.message_id);
    return;
  }
  // Answers to "Set cost" / "Add driver information" questions on booking cards.
  const teamMember = await approved(m.from);
  if (teamMember && await handleBookingAnswer(m, teamMember.display_name, refreshBookingCard)) return;
  // Customer answers: replies to a Waydidi card or prompt, or the next plain message from someone
  // who tapped "Reply" in the last 10 minutes. Other group talk is ignored.
  if (!text || text.startsWith("/")) return;
  let conversationId = m.reply_to_message ? await conversationForTelegramMessage(m.reply_to_message.message_id) : null;
  if (!conversationId && !m.reply_to_message && m.from) {
    const recent = await db().prepare("SELECT conversation_id FROM telegram_reply_prompts WHERE telegram_user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1")
      .bind(String(m.from.id), new Date(Date.now() - 10 * 60 * 1000).toISOString()).first<{ conversation_id: string }>();
    conversationId = recent?.conversation_id ?? null;
    // Used once: a second plain message isn't sent to the customer by accident.
    if (conversationId) await db().prepare("UPDATE telegram_reply_prompts SET telegram_user_id=NULL WHERE telegram_user_id=?").bind(String(m.from.id)).run();
  }
  if (!conversationId) return;
  const admin = await approved(m.from);
  if (!admin) {
    await sendCard(`Not sent to the customer: you're not on the Waydidi Telegram team. Your Telegram ID is <code>${m.from?.id ?? "unknown"}</code>.`, undefined, m.message_id);
    return;
  }
  if (text.length > 2000) { await sendCard("Not sent: replies can be up to 2,000 characters.", undefined, m.message_id); return; }
  const result = await addStaffMessage(conversationId, text, { name: admin.display_name, staffId: admin.staff_id, telegramUserId: String(m.from!.id) }, "telegram", m.message_id);
  if ("error" in result) await sendCard(`${esc(result.error)}`, undefined, m.message_id);
}

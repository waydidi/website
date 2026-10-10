import { env } from "cloudflare:workers";

// Telegram Bot API client. The token and chat id live in Worker secrets only; nothing here is sent to browsers.

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = InlineButton[][];
export type TelegramMessage = { message_id: number; chat: { id: number; type?: string }; from?: TelegramUser; text?: string; reply_to_message?: TelegramMessage };
export type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean };

export const telegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
export const telegramChatId = () => String(env.TELEGRAM_CHAT_ID ?? "");

/** A Bot API rejection is safe to retry; a transport failure may have been delivered. */
export class TelegramDeliveryError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

export async function tg<T = unknown>(method: string, payload: Record<string, unknown>, retried = false): Promise<T> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  let res: Response;
  try { res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
  }); } catch { throw new TelegramDeliveryError(`Telegram ${method}: delivery outcome unknown`, false); }
  const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
  // Telegram allows about 20 messages a minute per group. A short "slow down" is waited out once;
  // a longer one throws, and failed customer messages are re-sent by the scheduled job.
  const wait = data.parameters?.retry_after;
  if (res.status === 429 && !retried && wait && wait <= 5) { await new Promise((r) => setTimeout(r, wait * 1000)); return tg<T>(method, payload, true); }
  // Never log the URL (it contains the token); only the method and Telegram's description.
  if (!data.ok) throw new TelegramDeliveryError(`Telegram ${method} failed: ${String(data.description ?? res.status).replaceAll(token, "[redacted]")}`, res.status >= 400 && res.status < 500);
  return data.result as T;
}

export const sendCard = (text: string, keyboard?: InlineKeyboard, replyTo?: number) =>
  tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}) });

/** A message to one person's private chat with the bot (they must have pressed Start once). */
export const sendPrivate = (chatId: string, text: string, replyTo?: number) =>
  tg<TelegramMessage>("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}) });

export async function editCard(messageId: number, text: string, keyboard?: InlineKeyboard) {
  try {
    await tg("editMessageText", { chat_id: telegramChatId(), message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard ?? [] } });
  } catch (error) {
    // Editing to identical content is not an error worth surfacing.
    if (!(error instanceof Error && /not modified/i.test(error.message))) throw error;
  }
}

export const answerCallback = (id: string, text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text, show_alert: alert } : {}) }).catch(() => undefined);

/** A photo to the group (multipart upload), optionally as a reply to a card. */
export async function sendPhoto(photo: ArrayBuffer, caption: string, replyTo?: number, keyboard?: InlineKeyboard) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const form = new FormData();
  form.set("chat_id", telegramChatId());
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  if (replyTo) form.set("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  if (keyboard) form.set("reply_markup", JSON.stringify({ inline_keyboard: keyboard }));
  form.set("photo", new Blob([photo], { type: "image/jpeg" }), "trip-photo.jpg");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: TelegramMessage; description?: string };
  if (!data.ok) throw new TelegramDeliveryError(`Telegram sendPhoto failed: ${String(data.description ?? res.status).replaceAll(token, "[redacted]")}`, res.status >= 400 && res.status < 500);
  return data.result as TelegramMessage;
}

import { env } from "cloudflare:workers";

// Telegram Bot API client. The token and chat id live in Worker secrets only; nothing here is sent to browsers.

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = InlineButton[][];
export type TelegramMessage = { message_id: number; chat: { id: number }; from?: TelegramUser; text?: string; reply_to_message?: TelegramMessage };
export type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean };

export const telegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
export const telegramChatId = () => String(env.TELEGRAM_CHAT_ID ?? "");

export async function tg<T = unknown>(method: string, payload: Record<string, unknown>, retried = false): Promise<T> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
  // Telegram allows about 20 messages a minute per group. A short "slow down" is waited out once;
  // a longer one throws, and failed customer messages are re-sent by the scheduled job.
  const wait = data.parameters?.retry_after;
  if (res.status === 429 && !retried && wait && wait <= 5) { await new Promise((r) => setTimeout(r, wait * 1000)); return tg<T>(method, payload, true); }
  // Never log the URL (it contains the token); only the method and Telegram's description.
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

export const sendCard = (text: string, keyboard?: InlineKeyboard, replyTo?: number) =>
  tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
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

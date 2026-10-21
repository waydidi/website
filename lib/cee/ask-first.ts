import { env } from "cloudflare:workers";
import { refreshCard } from "@/lib/website-chat";
import { scheduleNon } from "@/lib/cee/schedule";

// "Ask me first": a new customer chat (website, WhatsApp or LINE) goes to Telegram with two buttons, Let AI answer
// or I'll answer. Non (the AI) stays quiet until one is chosen, and answers by itself when nobody chooses in time,
// so a customer is never left waiting. Off by default (switch in Admin → Website chat).
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> } } };
const db = () => env.DB as unknown as Db;
const setting = async (key: string) => (await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>().catch(() => null))?.value ?? null;
const put = (key: string, value: string) => db().prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, value, new Date().toISOString()).run();

export const ASK_FIRST_STATE = "ask_first";
export const DEFAULT_ASK_MINUTES = 5;
export const askFirstOn = async () => (await setting("cee_ask_first")) === "1";
export const askFirstMinutes = async () => { const n = Number(await setting("cee_ask_first_minutes")); return Number.isInteger(n) && n >= 1 && n <= 60 ? n : DEFAULT_ASK_MINUTES; };
export const setAskFirst = async (on: boolean, minutes?: number) => { await put("cee_ask_first", on ? "1" : "0"); if (minutes !== undefined && Number.isInteger(minutes) && minutes >= 1 && minutes <= 60) await put("cee_ask_first_minutes", String(minutes)); };

/** A new chat waits for a choice (only while Non is on and the switch is on). */
export async function gateNewConversation(conversationId: string) {
  if (!(env as unknown as Record<string, unknown>).ANTHROPIC_API_KEY || (await setting("cee_enabled")) === "0" || !(await askFirstOn())) return false;
  const r = await db().prepare("UPDATE website_conversations SET bot_paused=1,bot_state=? WHERE id=? AND assigned_name IS NULL AND status<>'closed'").bind(ASK_FIRST_STATE, conversationId).run();
  return r.meta.changes > 0;
}

/** "Let AI answer": once, only while the chat is still waiting for the choice. Returns false when someone already chose. */
export async function letAiAnswer(conversationId: string, how: "button" | "timeout" = "button") {
  const r = await db().prepare("UPDATE website_conversations SET bot_paused=0,bot_state=? WHERE id=? AND bot_state=? AND bot_paused=1 AND assigned_name IS NULL AND status<>'closed'")
    .bind(how === "timeout" ? "ai_timeout" : "ai_chosen", conversationId, ASK_FIRST_STATE).run();
  if (!r.meta.changes) return false;
  await refreshCard(conversationId, true).catch(() => undefined);
  await scheduleNon(conversationId).catch(() => undefined);
  return true;
}

/** Cron: chats nobody chose for within the wait are handed to Non. */
export async function releaseWaitingChats(now = new Date()) {
  if (!(await askFirstOn())) return 0;
  const cutoff = new Date(now.getTime() - (await askFirstMinutes()) * 60_000).toISOString();
  const { results } = await db().prepare("SELECT id FROM website_conversations WHERE bot_state=? AND bot_paused=1 AND assigned_name IS NULL AND status<>'closed' AND created_at<=? ORDER BY created_at LIMIT 10").bind(ASK_FIRST_STATE, cutoff).all<{ id: string }>();
  let n = 0;
  for (const { id } of results) if (await letAiAnswer(id, "timeout")) n++;
  return n;
}

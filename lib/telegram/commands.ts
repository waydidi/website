import { env } from "cloudflare:workers";
import { telegramChatId, telegramConfigured, tg } from "@/lib/telegram/client";

// The "/" menu in the Admin (team) group: typing "/" shows these with their descriptions and tapping one fills it in.
// Registered once with Telegram (setMyCommands, scoped to the team group only) and again only when this list changes.
export const TEAM_COMMANDS = [
  { command: "comment", description: "Draft a Facebook comment from a travel-group post" },
  { command: "ask", description: "Ask the assistant about bookings, drivers or prices" },
  { command: "id", description: "Show my Telegram ID" },
];
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<unknown> } } };
const db = () => env.DB as unknown as Db;
const setting = async (key: string) => (await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>().catch(() => null))?.value ?? null;
const put = (key: string, value: string) => db().prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, value, new Date().toISOString()).run();
const RETRY_MINUTES = 10;

/** Makes the "/" menu match TEAM_COMMANDS. Cheap when nothing changed (one settings read). Returns true when it registered them. */
export async function syncBotCommands(call: (method: string, payload: Record<string, unknown>) => Promise<unknown> = tg, now = new Date()) {
  if (!telegramConfigured()) return false;
  const want = JSON.stringify({ chat: telegramChatId(), commands: TEAM_COMMANDS });
  if ((await setting("tg_commands_synced")) === want) return false;
  const tried = Date.parse((await setting("tg_commands_tried")) ?? "");
  if (Number.isFinite(tried) && now.getTime() - tried < RETRY_MINUTES * 60_000) return false;
  await put("tg_commands_tried", now.toISOString());
  try {
    await call("setMyCommands", { commands: TEAM_COMMANDS, scope: { type: "chat", chat_id: telegramChatId() } });
    await put("tg_commands_synced", want);
    return true;
  } catch (error) { console.error("telegram commands not registered", error instanceof Error ? error.message : "unknown"); return false; }
}

import { env } from "cloudflare:workers";
import { telegramChatId, telegramCommentChatId, telegramConfigured, tg } from "@/lib/telegram/client";

// The "/" menu in the team groups: typing "/" shows these with their descriptions and tapping one fills it in.
// Registered with Telegram (setMyCommands, scoped to each group) once, and again only when the list or the groups change.
export const COMMENT_COMMAND = { command: "c", description: "Draft a Facebook comment from a travel-group post" };
const ADMIN_COMMANDS = [
  { command: "ask", description: "Ask the assistant about bookings, drivers or prices" },
  { command: "id", description: "Show my Telegram ID" },
];
/** The menu for each group: /c in the Comment group; the Admin group has it only until a Comment group is set up. */
export const menus = (adminChat: string, commentChat: string) => [
  { chat: adminChat, commands: commentChat ? ADMIN_COMMANDS : [COMMENT_COMMAND, ...ADMIN_COMMANDS] },
  ...(commentChat && commentChat !== adminChat ? [{ chat: commentChat, commands: [COMMENT_COMMAND] }] : []),
];
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<unknown> } } };
const db = () => env.DB as unknown as Db;
const setting = async (key: string) => (await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>().catch(() => null))?.value ?? null;
const put = (key: string, value: string) => db().prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, value, new Date().toISOString()).run();
const RETRY_MINUTES = 10;

/** Makes the "/" menu match TEAM_COMMANDS. Cheap when nothing changed (one settings read). Returns true when it registered them. */
export async function syncBotCommands(call: (method: string, payload: Record<string, unknown>) => Promise<unknown> = tg, now = new Date()) {
  if (!telegramConfigured()) return false;
  const list = menus(telegramChatId(), telegramCommentChatId()), want = JSON.stringify(list);
  if ((await setting("tg_commands_synced")) === want) return false;
  const tried = Date.parse((await setting("tg_commands_tried")) ?? "");
  if (Number.isFinite(tried) && now.getTime() - tried < RETRY_MINUTES * 60_000) return false;
  await put("tg_commands_tried", now.toISOString());
  try {
    for (const m of list) await call("setMyCommands", { commands: m.commands, scope: { type: "chat", chat_id: m.chat } });
    await put("tg_commands_synced", want);
    return true;
  } catch (error) { console.error("telegram commands not registered", error instanceof Error ? error.message : "unknown"); return false; }
}

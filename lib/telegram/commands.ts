import { env } from "cloudflare:workers";
import { telegramChatId, telegramCommentChatId, telegramConfigured, tg } from "@/lib/telegram/client";
import { tripBuilderOn } from "@/lib/telegram/trip-builder-rules";
import { bookingBuilderOn } from "@/lib/telegram/booking-builder-rules";

// The "/" menu in the team groups: typing "/" shows these with their descriptions and tapping one fills it in.
// Registered with Telegram (setMyCommands, scoped to each group) once, and again only when the list or the groups change.
export const COMMENT_COMMAND = { command: "c", description: "Draft a Facebook comment from a travel-group post" };
const ADMIN_COMMANDS = [
  { command: "pdf", description: "Booking confirmation PDF: /pdf REF or customer name" },
  { command: "ask", description: "Ask the assistant about bookings, drivers or prices" },
  { command: "id", description: "Show my Telegram ID" },
];
/** The menu for each group: /c in the Comment group (the Admin group has it only until a Comment group is set up); /add_trip and /add_attraction in the Admin group once TELEGRAM_TRIP_BUILDER=1. */
const TRIP_BUILDER_COMMANDS = [
  { command: "add_trip", description: "Build a smart trip: type freely, check, then build" },
  { command: "add_attraction", description: "Add or update an attraction (category, area, hours, photos)" },
];
/** /add_booking in the Admin group once TELEGRAM_BOOKING_BUILDER=1. */
const BOOK_COMMAND = { command: "add_booking", description: "Create a new booking: type the details, get the PDF" };
export const menus = (adminChat: string, commentChat: string, tripBuilder = false, bookingBuilder = false) => [
  { chat: adminChat, commands: [...(commentChat ? [] : [COMMENT_COMMAND]), ...(bookingBuilder ? [BOOK_COMMAND] : []), ...(tripBuilder ? TRIP_BUILDER_COMMANDS : []), ...ADMIN_COMMANDS] },
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
  const vars = env as unknown as Record<string, string | undefined>;
  const list = menus(telegramChatId(), telegramCommentChatId(), tripBuilderOn(vars), bookingBuilderOn(vars)), want = JSON.stringify(list);
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

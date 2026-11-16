import { env } from "cloudflare:workers";
import { sendTo, telegramChatId } from "@/lib/telegram/client";

// When Anthropic refuses an AI call because the account is out of credit, the Admin group is told once (at most every
// ALERT_HOURS) so an admin tops up. Anthropic has no API for the remaining balance, so this fires when credit has run
// out, not before; Console → Billing → auto-reload keeps it from happening. Claimed in one guarded write, so two calls
// failing at the same moment post one alert.

const KEY = "tg_ai_credit_alert_at";
export const ALERT_HOURS = 6;
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { run: () => Promise<{ meta: { changes: number } }> } } };

export const CREDIT_ALERT_TH = [
  "⚠️ <b>เครดิต AI (Anthropic) หมดแล้ว</b>",
  "คำสั่งที่ใช้ AI (/trip, /book แบบพิมพ์อิสระ, /c และผู้ช่วย /ask) ใช้ไม่ได้จนกว่าจะเติมเครดิต",
  "แอดมินเติมได้ที่ console.anthropic.com → Billing (แนะนำเปิด Auto-reload เพื่อเติมอัตโนมัติก่อนหมด)",
].join("\n");

/** Posts the out-of-credit alert in the Admin group unless one was posted in the last ALERT_HOURS. True when posted. */
export async function alertAiOutOfCredit(now = new Date()) {
  const chat = telegramChatId();
  if (!chat) return false;
  const at = now.toISOString(), since = new Date(now.getTime() - ALERT_HOURS * 3_600_000).toISOString();
  const claimed = await (env.DB as unknown as Db).prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value < ?`).bind(KEY, at, at, since).run().catch(() => null);
  if (!claimed?.meta.changes) return false;
  await sendTo(chat, CREDIT_ALERT_TH).catch((error) => console.error("credit alert not posted", error instanceof Error ? error.message : "unknown"));
  return true;
}

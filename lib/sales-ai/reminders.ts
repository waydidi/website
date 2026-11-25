import { env } from "cloudflare:workers";
import { getMessages, translate } from "@/lib/i18n";
import { sendWhatsappTemplate } from "@/lib/channels";
import { addTemplateMessage } from "@/lib/website-chat";
import { logActivity } from "./activity-log";
import { conversationSignals, ensureLeadTables } from "./leads";
import { outsideQuietHours } from "./lead-rules";
import { customerLocale } from "./quote-rules";
import { CONSENT_WINDOW_MS, REMINDER_AFTER_DAYS, isReminderYes, reminderDecision, templateLanguage, validTemplateName } from "./reminder-rules";
import { disabledChannels } from "./whatsapp-rules";

// 3-day quote reminder (Sales Intelligence PR 6; on with SALES_AI_TEMPLATE_FOLLOWUPS=1 and an approved template named
// in WHATSAPP_TEMPLATE_QUOTE_REMINDER). The quote message asks "Would you like a reminder in 3 days? Reply YES."; only
// a YES within 24 hours queues one reminder, which is sent as the approved WhatsApp template after the checks below.
// The job is claimed before sending, so it is sent at most once; an interrupted send is recorded, never repeated.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const vars = () => env as unknown as Record<string, string | undefined>;
const LEASE_MS = 5 * 60_000;

export const templateName = () => vars().WHATSAPP_TEMPLATE_QUOTE_REMINDER?.trim() || null;
export const templateRemindersEnabled = () => vars().SALES_AI_TEMPLATE_FOLLOWUPS === "1" && validTemplateName(templateName());
/** Whether the quote message offers the reminder (WhatsApp only, and only when a reminder can actually be sent). */
export const reminderOffered = (channel: string | null | undefined) => channel === "whatsapp" && templateRemindersEnabled();

// Same statements as drizzle/0132_whatsapp_template_reminders.sql (Workers Builds does not apply D1 migrations).
export const REMINDER_TABLES = [
  `CREATE TABLE IF NOT EXISTS ai_template_reminders(bundle_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,consent_message_id TEXT NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','running','sent','suppressed','cancelled','unknown')),reason TEXT,lease_until TEXT,channel_message_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_template_reminders_due ON ai_template_reminders(status,due_at)`,
  `CREATE TABLE IF NOT EXISTS ai_whatsapp_templates(name TEXT NOT NULL,language TEXT NOT NULL,status TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(name,language))`,
];
let ready: Promise<unknown> | null = null;
export function ensureReminderTables() {
  ready ??= (async () => { await ensureLeadTables(); await db().batch(REMINDER_TABLES.map((sql) => db().prepare(sql))); })().catch((error) => { ready = null; throw error; });
  return ready;
}

/** A customer message: a clear YES within 24 hours of a sent WhatsApp quote records consent and queues one reminder. */
export async function afterReminderReply(conversationId: string, messageId: string, body: string, at = new Date()) {
  if (!templateRemindersEnabled() || !isReminderYes(body)) return false;
  try {
    await ensureReminderTables();
    const quote = await db().prepare("SELECT bundle_id,decided_at FROM ai_quote_drafts WHERE conversation_id=? AND channel='whatsapp' AND status='sent' AND leg_no=1 AND decided_at>=? ORDER BY decided_at DESC LIMIT 1")
      .bind(conversationId, new Date(at.getTime() - CONSENT_WINDOW_MS).toISOString()).first<{ bundle_id: string; decided_at: string }>();
    if (!quote) return false;
    const due = outsideQuietHours(Date.parse(quote.decided_at) + REMINDER_AFTER_DAYS * 86400000);
    const stamp = at.toISOString();
    const res = await db().prepare("INSERT INTO ai_template_reminders(bundle_id,conversation_id,consent_message_id,due_at,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?) ON CONFLICT(bundle_id) DO NOTHING")
      .bind(quote.bundle_id, conversationId, messageId, new Date(due).toISOString(), stamp, stamp).run();
    if (res.meta.changes) await logActivity({ event: "template_consent", status: "ok", actor: "customer", channel: "whatsapp", conversationId, correlationId: quote.bundle_id,
      summary: `Customer replied YES to a 3-day reminder for quote ${quote.bundle_id}; the consent message is kept as evidence`, detail: { consentMessage: messageId, due: new Date(due).toISOString() } });
    return res.meta.changes > 0;
  } catch (error) { console.error("reminder consent failed", error instanceof Error ? error.message : "unknown"); return false; }
}

/** Meta's message_template_status_update webhook: remembered so a rejected or paused template is never used. */
export async function recordTemplateStatus(name: unknown, language: unknown, event: unknown) {
  if (!validTemplateName(typeof name === "string" ? name : null) || typeof language !== "string" || !/^[A-Za-z_]{2,10}$/.test(language) || typeof event !== "string" || !/^[A-Z_]{3,40}$/.test(event)) return;
  await ensureReminderTables();
  await db().prepare("INSERT INTO ai_whatsapp_templates(name,language,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(name,language) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at").bind(name, language, event, new Date().toISOString()).run();
  await logActivity({ event: "template_status", status: event === "APPROVED" ? "ok" : "error", actor: "whatsapp", channel: "whatsapp", summary: `WhatsApp template ${name} (${language}) is now ${event.toLowerCase()}` });
}

type Job = { bundle_id: string; conversation_id: string; consent_message_id: string; due_at: string };
const finish = (bundleId: string, status: string, reason: string | null, at: Date, channelMessageId: string | null = null) =>
  db().prepare("UPDATE ai_template_reminders SET status=?,reason=?,channel_message_id=?,lease_until=NULL,updated_at=? WHERE bundle_id=? AND status='running'").bind(status, reason, channelMessageId, at.toISOString(), bundleId).run();

/** Every minute (worker cron). A run interrupted mid-send is marked unknown and never repeated. */
export async function runTemplateReminders(at = new Date()) {
  if (vars().SALES_AI_TEMPLATE_FOLLOWUPS !== "1") return 0;
  await ensureReminderTables();
  const now = at.toISOString();
  await db().prepare("UPDATE ai_template_reminders SET status='unknown',reason='run interrupted; not re-sent',updated_at=? WHERE status='running' AND lease_until<?").bind(now, now).run();
  const due = (await db().prepare("SELECT * FROM ai_template_reminders WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 20").bind(now).all<Job>()).results;
  let sent = 0;
  for (const job of due) {
    const claimed = await db().prepare(`UPDATE ai_template_reminders SET status='running',lease_until=?,updated_at=? WHERE bundle_id=? AND status='pending' AND due_at<=?
      AND NOT EXISTS(SELECT 1 FROM ai_template_reminders o WHERE o.conversation_id=ai_template_reminders.conversation_id AND o.status='running')`).bind(new Date(at.getTime() + LEASE_MS).toISOString(), now, job.bundle_id, now).run();
    if (!claimed.meta.changes) continue;
    try { if (await runOne(job, at)) sent++; }
    catch (error) {
      await finish(job.bundle_id, "unknown", "error; not re-sent", at).catch(() => undefined);
      console.error("template reminder failed", error instanceof Error ? error.message : "unknown");
    }
  }
  return sent;
}

async function runOne(job: Job, at: Date) {
  const legs = (await db().prepare("SELECT d.trip_date,d.trip_time,q.status quote_status FROM ai_quote_drafts d LEFT JOIN crm_quotes q ON q.id=d.crm_quote_id WHERE d.bundle_id=? ORDER BY d.leg_no").bind(job.bundle_id).all<{ trip_date: string; trip_time: string; quote_status: string | null }>()).results;
  const c = await db().prepare("SELECT channel_user_id,assigned_name FROM website_conversations WHERE id=?").bind(job.conversation_id).first<{ channel_user_id: string | null; assigned_name: string | null }>();
  const consent = await db().prepare("SELECT created_at FROM website_chat_messages WHERE id=?").bind(job.consent_message_id).first<{ created_at: string }>();
  const later = consent ? await db().prepare("SELECT 1 x FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' AND created_at>? LIMIT 1").bind(job.conversation_id, consent.created_at).first() : null;
  const recent = (await db().prepare("SELECT body FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' ORDER BY rowid DESC LIMIT 5").bind(job.conversation_id).all<{ body: string }>()).results;
  const locale = customerLocale(recent.map((r) => r.body).join(" "));
  const name = templateName(), language = templateLanguage(locale, vars().WHATSAPP_TEMPLATE_LANGUAGES);
  const state = name ? await db().prepare("SELECT status FROM ai_whatsapp_templates WHERE name=? AND language=?").bind(name, language).first<{ status: string }>() : null;
  const signals = await conversationSignals(job.conversation_id);
  const sentThisWeek = (await db().prepare("SELECT COUNT(*) n FROM ai_template_reminders WHERE conversation_id=? AND status='sent' AND updated_at>?").bind(job.conversation_id, new Date(at.getTime() - 7 * 86400000).toISOString()).first<{ n: number }>())?.n ?? 0;
  const decision = reminderDecision({
    now: at.getTime(), flagOn: templateRemindersEnabled(), templateName: name, templateState: state?.status ?? null,
    accepted: !legs.length || legs.some((l) => l.quote_status === "accepted" || l.quote_status === "converted"), optedOut: signals.has("opted_out"), declined: signals.has("declined"),
    repliedSinceConsent: Boolean(later), assignedName: c?.assigned_name ?? null, channelOff: disabledChannels(vars().ASSISTANT_DISABLED_CHANNELS).has("whatsapp"),
    firstPickupAt: Math.min(...legs.map((l) => Date.parse(`${l.trip_date}T${l.trip_time}:00+07:00`))), sentThisWeek, quiet: outsideQuietHours(at.getTime()) !== at.getTime(),
  });
  if (!decision.send) {
    if (decision.outcome === "later") {
      await db().prepare("UPDATE ai_template_reminders SET status='pending',due_at=?,lease_until=NULL,updated_at=? WHERE bundle_id=? AND status='running'").bind(new Date(outsideQuietHours(at.getTime())).toISOString(), at.toISOString(), job.bundle_id).run();
      return false;
    }
    await finish(job.bundle_id, decision.outcome, decision.reason, at);
    await logActivity({ event: "template_skipped", status: decision.outcome === "cancelled" ? "skipped" : "suppressed", actor: "system", channel: "whatsapp", conversationId: job.conversation_id, correlationId: job.bundle_id,
      dedupeKey: `reminder:${job.bundle_id}`, summary: `3-day reminder not sent: ${decision.reason}` });
    return false;
  }
  const date = legs[0].trip_date;
  let messageId: string | null = null;
  try { messageId = await sendWhatsappTemplate(c!.channel_user_id!, name!, language, [date]); }
  catch (error) {
    const reason = error instanceof Error ? error.message : "send failed";
    await finish(job.bundle_id, "suppressed", reason.slice(0, 200), at);
    await logActivity({ event: "template_skipped", status: "error", actor: "system", channel: "whatsapp", conversationId: job.conversation_id, correlationId: job.bundle_id, dedupeKey: `reminder:${job.bundle_id}`, summary: `3-day reminder refused by WhatsApp: ${reason}` });
    return false;
  }
  // Recorded in the chat with its WhatsApp id (delivery status arrives through the webhook as for any message).
  await addTemplateMessage(job.conversation_id, translate(getMessages(locale), "salesReminder.templateCopy", { date }), messageId ?? "template");
  await finish(job.bundle_id, "sent", null, at, messageId);
  await logActivity({ event: "template_sent", status: "ok", actor: "system", channel: "whatsapp", conversationId: job.conversation_id, correlationId: job.bundle_id,
    dedupeKey: `reminder:${job.bundle_id}`, summary: `3-day reminder sent as template ${name} (${language}), with the customer's YES on record` });
  return true;
}

/** Hourly retention: finished reminders after the activity-log retention period. */
export async function purgeReminders(retentionDays: number, at = new Date()) {
  await ensureReminderTables();
  await db().prepare("DELETE FROM ai_template_reminders WHERE status NOT IN ('pending','running') AND updated_at<?").bind(new Date(at.getTime() - retentionDays * 86400000).toISOString()).run();
}

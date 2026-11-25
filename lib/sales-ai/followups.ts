import { env } from "cloudflare:workers";
import { getMessages, translate } from "@/lib/i18n";
import { addBotMessage } from "@/lib/website-chat";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { logActivity } from "./activity-log";
import { ensureLeadTables, conversationSignals, leadsEnabled } from "./leads";
import { LOSS_LABEL, LOSS_REASONS, REVIEW_AFTER_DAYS, followupDecision, followupHours, outsideQuietHours } from "./lead-rules";
import { customerLocale } from "./quote-rules";
import { disabledChannels, whatsappWindowOpen } from "./whatsapp-rules";

// Follow-ups (F10, Sales Intelligence PR 5; customer messages only with SALES_AI_FOLLOWUPS=1). After a quote is
// sent, short follow-ups are queued; whether one is sent is decided at send time from the chat as it is then
// (reply, takeover, acceptance, decline, opt-out, trip passed, 24-hour window, quiet hours, weekly cap). Each job is
// leased and claimed before sending, so a retry never sends twice. A 7-day internal review asks the owner (with
// SALES_AI_LEADS=1) why an unanswered quote was lost. There is no daily or scheduled sales report.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const vars = () => env as unknown as Record<string, string | undefined>;
export const followupsEnabled = () => vars().SALES_AI_FOLLOWUPS === "1";
const LEASE_MS = 5 * 60_000;

/** After an approved quote reached the customer: queue its follow-ups and the internal review. */
export async function scheduleFollowups(bundleId: string, conversationId: string, sentAt = new Date()) {
  const jobs: [kind: "customer" | "review", seq: number, due: number][] = [];
  if (followupsEnabled()) followupHours(vars().SALES_AI_FOLLOWUP_HOURS).forEach((h, i) => jobs.push(["customer", i + 1, outsideQuietHours(sentAt.getTime() + h * 3600_000)]));
  if (leadsEnabled()) jobs.push(["review", 1, outsideQuietHours(sentAt.getTime() + REVIEW_AFTER_DAYS * 86400000)]);
  if (!jobs.length) return;
  await ensureLeadTables();
  const stamp = new Date().toISOString();
  await db().batch(jobs.map(([kind, seq, due]) => db().prepare("INSERT INTO ai_followups(id,bundle_id,conversation_id,kind,seq,due_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?) ON CONFLICT(bundle_id,kind,seq) DO NOTHING")
    .bind(crypto.randomUUID(), bundleId, conversationId, kind, seq, new Date(due).toISOString(), stamp, stamp)));
}

type Job = { id: string; bundle_id: string; conversation_id: string; kind: "customer" | "review"; seq: number; due_at: string; status: string };
const finish = (id: string, status: string, reason: string | null, at = new Date()) =>
  db().prepare("UPDATE ai_followups SET status=?,reason=?,lease_until=NULL,updated_at=? WHERE id=? AND status='running'").bind(status, reason, at.toISOString(), id).run();

/** Every minute (worker cron). Jobs whose lease ran out mid-run are marked unknown, never re-sent. */
export async function runFollowups(at = new Date()) {
  if (!followupsEnabled() && !leadsEnabled()) return 0;
  await ensureLeadTables();
  const now = at.toISOString();
  await db().prepare("UPDATE ai_followups SET status='unknown',reason='run interrupted; not re-sent',updated_at=? WHERE status='running' AND lease_until<?").bind(now, now).run();
  const due = (await db().prepare("SELECT * FROM ai_followups WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 20").bind(now).all<Job>()).results;
  let done = 0;
  for (const job of due) {
    // One follow-up per chat at a time (two overlapping runs cannot each send one), checked in the same statement.
    const claimed = await db().prepare(`UPDATE ai_followups SET status='running',lease_until=?,updated_at=? WHERE id=? AND status='pending' AND due_at<=?
      AND NOT EXISTS(SELECT 1 FROM ai_followups o WHERE o.conversation_id=ai_followups.conversation_id AND o.status='running')`).bind(new Date(at.getTime() + LEASE_MS).toISOString(), now, job.id, now).run();
    if (!claimed.meta.changes) continue;
    try { await (job.kind === "review" ? runReview(job) : runCustomer(job, at)); done++; }
    catch (error) {
      await finish(job.id, "unknown", "error; not re-sent").catch(() => undefined);
      console.error("follow-up failed", error instanceof Error ? error.message : "unknown");
    }
  }
  return done;
}

async function quoteState(job: Job) {
  const legs = (await db().prepare("SELECT d.*,q.status quote_status FROM ai_quote_drafts d LEFT JOIN crm_quotes q ON q.id=d.crm_quote_id WHERE d.bundle_id=? ORDER BY d.leg_no").bind(job.bundle_id).all<{ status: string; decided_at: string | null; quote_expires_at: string | null; trip_date: string; trip_time: string; quote_status: string | null; channel: string; conversation_id: string }>()).results;
  const accepted = legs.some((l) => l.quote_status === "accepted" || l.quote_status === "converted");
  const firstPickupAt = Math.min(...legs.map((l) => Date.parse(`${l.trip_date}T${l.trip_time}:00+07:00`)));
  return { legs, accepted, firstPickupAt, sentAt: legs[0]?.decided_at ?? job.due_at, validUntil: legs.map((l) => l.quote_expires_at).filter(Boolean).sort()[0] ?? null };
}

async function runCustomer(job: Job, at: Date) {
  const q = await quoteState(job);
  const c = await db().prepare("SELECT status,assigned_name,bot_paused,channel FROM website_conversations WHERE id=?").bind(job.conversation_id).first<{ status: string; assigned_name: string | null; bot_paused: number | null; channel: string | null }>();
  const lastVisitor = await db().prepare("SELECT body,created_at FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' ORDER BY rowid DESC LIMIT 1").bind(job.conversation_id).first<{ body: string; created_at: string }>();
  const signals = await conversationSignals(job.conversation_id);
  const weekAgo = new Date(at.getTime() - 7 * 86400000).toISOString();
  const sent = await db().prepare("SELECT COUNT(*) n,MAX(updated_at) last FROM ai_followups WHERE conversation_id=? AND kind='customer' AND status='sent' AND updated_at>?").bind(job.conversation_id, weekAgo).first<{ n: number; last: string | null }>();
  const sentThisWeek = sent?.n ?? 0;
  const channel = c?.channel ?? "web";
  const decision = followupDecision({
    now: at.getTime(), flagOn: followupsEnabled(), channelOff: disabledChannels(vars().ASSISTANT_DISABLED_CHANNELS).has(channel),
    conversationStatus: c?.status ?? null, assignedName: c?.assigned_name ?? null, botPaused: Boolean(c?.bot_paused),
    repliedSinceQuote: Boolean(lastVisitor && q.sentAt && lastVisitor.created_at > q.sentAt), accepted: q.accepted || q.legs.length === 0,
    optedOut: signals.has("opted_out"), declined: signals.has("declined"), firstPickupAt: q.firstPickupAt, sentThisWeek, lastSentAt: sent?.last ? Date.parse(sent.last) : null,
    windowOpen: channel !== "whatsapp" || whatsappWindowOpen(lastVisitor?.created_at, at.getTime()),
  });
  if (!decision.send) {
    if (decision.outcome === "later") {
      await db().prepare("UPDATE ai_followups SET status='pending',due_at=?,lease_until=NULL,updated_at=? WHERE id=? AND status='running'").bind(new Date(outsideQuietHours(at.getTime())).toISOString(), at.toISOString(), job.id).run();
      return;
    }
    await finish(job.id, decision.outcome, decision.reason);
    await logActivity({ event: "followup_skipped", status: decision.outcome === "cancelled" ? "skipped" : "suppressed", actor: "system", channel, conversationId: job.conversation_id, correlationId: job.bundle_id,
      dedupeKey: `followup:${job.id}`, summary: `Follow-up ${job.seq} not sent: ${decision.reason}` });
    return;
  }
  // Never offers an expired price: the reminder names the validity only while the quote is still valid.
  const valid = q.validUntil && Date.parse(q.validUntil) > at.getTime() + 10 * 60_000 ? q.validUntil : null;
  const locale = customerLocale(lastVisitor?.body);
  const date = q.legs[0]?.trip_date ?? "";
  const text = valid
    ? translate(getMessages(locale), "salesFollowup.validReminder", { date, validUntil: new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-ca-gregory" : locale === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(valid)) })
    : translate(getMessages(locale), "salesFollowup.checkIn", { date });
  // The insert itself refuses if a person took the chat in the meantime.
  const messageId = await addBotMessage(job.conversation_id, text, null, { onlyWhileNonActive: true });
  const delivery = messageId ? await db().prepare("SELECT channel_message_id FROM website_chat_messages WHERE id=?").bind(messageId).first<{ channel_message_id: string | null }>() : null;
  const failed = !messageId ? "a person took the chat" : delivery?.channel_message_id === "outside_window" ? "outside the 24-hour window" : delivery?.channel_message_id === "failed" ? "the channel rejected it" : null;
  await finish(job.id, failed ? "suppressed" : "sent", failed, at);
  await logActivity({ event: failed ? "followup_skipped" : "followup_sent", status: failed ? "suppressed" : "ok", actor: "system", channel, conversationId: job.conversation_id, correlationId: job.bundle_id,
    dedupeKey: `followup:${job.id}`, summary: failed ? `Follow-up ${job.seq} not delivered: ${failed}` : `Follow-up ${job.seq} sent (${valid ? "validity reminder" : "check-in, no price"})` });
}

async function runReview(job: Job) {
  const q = await quoteState(job);
  const labeled = await db().prepare("SELECT 1 x FROM ai_loss_labels WHERE bundle_id=?").bind(job.bundle_id).first();
  if (!leadsEnabled() || q.accepted || labeled || !q.legs.length || !telegramConfigured()) { await finish(job.id, "cancelled", q.accepted ? "quote accepted" : labeled ? "already labelled" : "nothing to review"); return; }
  const c = await db().prepare("SELECT public_id FROM website_conversations WHERE id=?").bind(job.conversation_id).first<{ public_id: string | null }>();
  const buttons = LOSS_REASONS.filter((r) => r !== "response_delay").map((r) => ({ text: LOSS_LABEL[r], callback_data: `sl:${job.bundle_id}:${LOSS_REASONS.indexOf(r)}` }));
  await sendCard(`<b>No reply for ${REVIEW_AFTER_DAYS} days</b> · quote ${job.bundle_id} · ${c?.public_id ?? job.conversation_id.slice(0, 8)}\nIf you know why it was not booked, tap a reason. "Unknown" is fine; nothing is sent to the customer.`,
    [buttons.slice(0, 4), buttons.slice(4)]);
  await finish(job.id, "sent", null);
  await logActivity({ event: "quote_review", status: "ok", actor: "system", conversationId: job.conversation_id, correlationId: job.bundle_id, dedupeKey: `review:${job.id}`, summary: `Asked the owner why quote ${job.bundle_id} got no reply` });
}

/** Hourly retention: finished jobs after the activity-log retention period. */
export async function purgeFollowups(retentionDays: number, at = new Date()) {
  await ensureLeadTables();
  await db().prepare("DELETE FROM ai_followups WHERE status NOT IN ('pending','running') AND updated_at<?").bind(new Date(at.getTime() - retentionDays * 86400000).toISOString()).run();
}

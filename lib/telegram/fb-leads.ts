import { env } from "cloudflare:workers";
import { DRAFTING_TIMEOUT_MIN, LEAD_KEEP_DAYS, MAX_ATTEMPTS, dailyLimit, isLead, leadsEnabled, reliability, screenPost, thaiDayStart, thaiStamp, type IncomingPost, type LeadAction } from "@/lib/fb-leads-rules";
import { assistantFailure } from "@/lib/assistant-error-rules";
import { esc } from "@/lib/telegram/cards";
import { answerCallback, editIn, sendTo, telegramCommentChatId, type InlineKeyboard, type TelegramMessage } from "@/lib/telegram/client";
import { assistantUsage } from "@/lib/telegram/assistant";
import { draftForPost, postHelperOn, type Draft } from "@/lib/telegram/post-helper";

// Facebook group leads: posts sent in by a collector are queued here, drafted by the same writer as /c (the owner's
// playbook in Admin → Writing assistant, web facts checked), and sent to the Comment group as two messages: the
// comment alone, then the group, the post link and the checks with Posted / Skip. Nothing is ever posted on Facebook.
// Off until FB_LEADS_ENABLED=true (lib/fb-leads-rules → leadsEnabled).
type Stmt = { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> } };
type Db = { prepare: (sql: string) => Stmt };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
export const fbLeadsOn = () => leadsEnabled(vars());

let ready: Promise<unknown> | null = null;
/** Same tables as drizzle/0120_fb_leads.sql (Workers Builds does not apply migrations). */
export function ensureLeadTables() {
  return (ready ??= (async () => {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS fb_leads (id TEXT PRIMARY KEY, group_key TEXT NOT NULL, group_name TEXT NOT NULL, post_key TEXT NOT NULL, post_url TEXT NOT NULL, post_text TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','drafting','drafted','sent','posted','skipped','not_lead','failed')), attempts INTEGER NOT NULL DEFAULT 0, reply_type TEXT, reliable INTEGER, comment TEXT, details_html TEXT, keyboard_json TEXT, draft_id TEXT, comment_message_id INTEGER, link_message_id INTEGER, marked_by TEXT, marked_by_id TEXT, marked_at TEXT, drafted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(group_key, post_key))",
      "CREATE INDEX IF NOT EXISTS fb_leads_status ON fb_leads(status, created_at)",
      "CREATE INDEX IF NOT EXISTS fb_leads_drafted ON fb_leads(drafted_at)",
      "CREATE INDEX IF NOT EXISTS fb_leads_group ON fb_leads(group_key, status)",
    ]) await db().prepare(sql).bind().run();
  })().catch((e) => { ready = null; throw e; }));
}

/** One short id per group post (fits Telegram's 64-byte button data), the same every time the post is sent in. */
export async function leadId(groupKey: string, postKey: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${groupKey}/${postKey}`)));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Queues posts; a post already sent in (same group and post) is ignored, so collectors may send the same post again.
 * A post that failed is queued again when it is sent in again. A post that asks or needs nothing (photos, chat), an
 * advert or promotion, or a search for a long stay (a month or more) is stored as "not a lead" at once, with no AI
 * cost and no message (lib/fb-leads-rules → screenPost).
 */
export async function queueLeads(posts: IncomingPost[], now = new Date()) {
  await ensureLeadTables();
  let accepted = 0, skipped = 0;
  for (const p of posts) {
    const at = now.toISOString(), request = screenPost(p.text).queue;
    const res = await db().prepare("INSERT OR IGNORE INTO fb_leads(id,group_key,group_name,post_key,post_url,post_text,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(group_key,post_key) DO UPDATE SET status='queued',attempts=0,post_text=excluded.post_text,group_name=excluded.group_name,updated_at=excluded.updated_at WHERE fb_leads.status='failed'")
      .bind(await leadId(p.groupKey, p.postKey), p.groupKey, p.groupName, p.postKey, p.url, p.text, request ? "queued" : "not_lead", at, at).run();
    accepted += res.meta.changes;
    if (res.meta.changes && !request) skipped++;
  }
  return { accepted, duplicates: posts.length - accepted, skipped };
}

type Lead = { id: string; group_name: string; post_url: string; post_text: string; status: string; attempts: number; reliable: number | null; comment: string | null; details_html: string | null; keyboard_json: string | null; comment_message_id: number | null; link_message_id: number | null; marked_by: string | null; marked_at: string | null };
const COLS = "id,group_name,post_url,post_text,status,attempts,reliable,comment,details_html,keyboard_json,comment_message_id,link_message_id,marked_by,marked_at";
const getLead = (id: string) => db().prepare(`SELECT ${COLS} FROM fb_leads WHERE id=?`).bind(id).first<Lead>();

const STATUS_LINE = { posted: "✅ Posted", skipped: "⏭ Skipped" } as const;
/** The second message: group, link, whether it is ready to post, then the same checks as /c. */
function linkMessage(lead: Lead) {
  const head = [`📌 <b>${esc(lead.group_name)}</b>`, esc(lead.post_url)];
  if (lead.reliable === 0) head.push(`⚠️ <b>Needs your check</b> before posting.`);
  if (lead.marked_by && (lead.status === "posted" || lead.status === "skipped")) head.push(`<b>${STATUS_LINE[lead.status]}</b> by ${esc(lead.marked_by)} · ${esc(thaiStamp(new Date(lead.marked_at ?? Date.now())))}`);
  return `${head.join("\n")}\n\n${lead.details_html ?? ""}`;
}
function linkKeyboard(lead: Lead): InlineKeyboard {
  const draftButtons = JSON.parse(lead.keyboard_json ?? "[]") as InlineKeyboard;
  const open = [{ text: "🔗 Open post", url: lead.post_url }];
  if (lead.status !== "sent") return [open, ...draftButtons];
  return [[{ text: "✅ Posted", callback_data: `fl_posted:${lead.id}` }, { text: "⏭ Skip", callback_data: `fl_skip:${lead.id}` }], open, ...draftButtons];
}

type Deps = { draft?: (text: string) => Promise<Draft>; send?: (chatId: string, text: string, keyboard?: InlineKeyboard) => Promise<TelegramMessage>; now?: () => Date };

/**
 * Sends a drafted lead: message 1 is the comment alone, message 2 the link and checks. Each message id is saved
 * as soon as it is sent, so a retry after a Telegram error never sends the same message twice.
 */
async function deliver(id: string, deps: Deps) {
  const send = deps.send ?? sendTo, chat = telegramCommentChatId(), now = () => (deps.now ?? (() => new Date()))().toISOString();
  let lead = await getLead(id);
  if (!lead || lead.status !== "drafted") return false;
  if (!lead.comment_message_id) {
    const m = await send(chat, esc(lead.comment ?? ""));
    await db().prepare("UPDATE fb_leads SET comment_message_id=?,updated_at=? WHERE id=? AND comment_message_id IS NULL").bind(m.message_id, now(), id).run();
  }
  lead = { ...lead, status: "sent" };
  const m = await send(chat, linkMessage(lead), linkKeyboard(lead));
  await db().prepare("UPDATE fb_leads SET link_message_id=?,status='sent',updated_at=? WHERE id=? AND status='drafted'").bind(m.message_id, now(), id).run();
  return true;
}

/** Drafts one claimed lead and stores the result. A social post is closed as "not a lead" without a message. */
async function draftLead(lead: Lead, deps: Deps) {
  const draft = await (deps.draft ?? ((text: string) => draftForPost(text)))(lead.post_text);
  const at = (deps.now ?? (() => new Date()))().toISOString();
  if (!isLead(draft.replyType)) {
    await db().prepare("UPDATE fb_leads SET status='not_lead',reply_type=?,draft_id=?,updated_at=? WHERE id=? AND status='drafting'").bind(draft.replyType, draft.id, at, lead.id).run();
    return false;
  }
  const check = reliability(draft);
  const details = `${check.reliable ? "" : `⚠️ Not ready to post: ${esc(check.reason)}. Check the facts yourself or tap Search again.\n\n`}${draft.parts.slice(1).join("\n\n")}`;
  await db().prepare("UPDATE fb_leads SET status='drafted',reply_type=?,reliable=?,comment=?,details_html=?,keyboard_json=?,draft_id=?,updated_at=? WHERE id=? AND status='drafting'")
    .bind(draft.replyType, check.reliable ? 1 : 0, draft.parts[0] ? unescapeHtml(draft.parts[0]) : "", details, JSON.stringify(draft.keyboard), draft.id, at, lead.id).run();
  return true;
}
const unescapeHtml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/**
 * Cron (every minute): sends drafts not yet delivered, then drafts a few queued posts within the daily limit
 * (FB_LEADS_DAILY_LIMIT) and the assistant's monthly budget. A draft that keeps failing is marked failed.
 */
export async function processLeads(deps: Deps & { batch?: number } = {}) {
  if (!fbLeadsOn()) return { drafted: 0, sent: 0 };
  await ensureLeadTables();
  const now = (deps.now ?? (() => new Date()))(), at = now.toISOString();
  // A draft that stopped half-way (the Worker was stopped) goes back to the queue, or fails after 3 tries.
  const stuck = new Date(now.getTime() - DRAFTING_TIMEOUT_MIN * 60_000).toISOString();
  await db().prepare("UPDATE fb_leads SET status=CASE WHEN attempts>=? THEN 'failed' ELSE 'queued' END,updated_at=? WHERE status='drafting' AND updated_at<?").bind(MAX_ATTEMPTS, at, stuck).run();

  let sent = 0, drafted = 0;
  const { results: waiting } = await db().prepare("SELECT id FROM fb_leads WHERE status='drafted' ORDER BY created_at LIMIT 5").bind().all<{ id: string }>();
  for (const w of waiting) {
    try { if (await deliver(w.id, deps)) sent++; } catch (error) { console.error("fb lead delivery failed", error instanceof Error ? error.message : "unknown"); return { drafted, sent }; }
  }

  if (!postHelperOn() && !deps.draft) return { drafted, sent };
  if (!deps.draft) { const usage = await assistantUsage(); if (usage.usd + 0.05 >= usage.capUsd) return { drafted, sent }; }
  const limit = dailyLimit(vars().FB_LEADS_DAILY_LIMIT), dayStart = thaiDayStart(now);
  const { results: queued } = await db().prepare(`SELECT ${COLS} FROM fb_leads WHERE status='queued' ORDER BY created_at LIMIT ?`).bind(deps.batch ?? 2).all<Lead>();
  for (const lead of queued) {
    // The claim and the daily limit are one statement, so two runs at once cannot pass the limit or draft a post twice.
    const claim = await db().prepare("UPDATE fb_leads SET status='drafting',attempts=attempts+1,drafted_at=?,updated_at=? WHERE id=? AND status='queued' AND (SELECT COUNT(*) FROM fb_leads WHERE drafted_at>=?)<?")
      .bind(at, at, lead.id, dayStart, limit).run();
    if (!claim.meta.changes) break;
    try {
      if (await draftLead(lead, deps)) { drafted++; if (await deliver(lead.id, deps)) sent++; }
    } catch (error) {
      // A failed draft goes back to the queue (failed after 3 tries); a failed send stays "drafted" and is sent next run.
      const budget = error instanceof Error && error.message === "ASSISTANT_BUDGET_REACHED";
      const failure = assistantFailure(error);
      console.error("fb lead draft failed", budget ? "budget" : failure.code);
      const left = await db().prepare("UPDATE fb_leads SET status=CASE WHEN attempts>=? THEN 'failed' ELSE 'queued' END,updated_at=? WHERE id=? AND status='drafting' RETURNING status").bind(MAX_ATTEMPTS, at, lead.id).first<{ status: string }>();
      // After the last try the team is told why (never the post text), so a broken key or an empty account is noticed.
      if (left?.status === "failed") await (deps.send ?? sendTo)(telegramCommentChatId(), `⚠️ Couldn't draft a comment for a post in <b>${esc(lead.group_name)}</b>: ${esc(budget ? "the assistant has reached this month's spending limit." : failure.reason)}
${esc(lead.post_url)}
Send the post in again to retry.`).catch(() => undefined);
    }
  }
  return { drafted, sent };
}

/**
 * ✅ Posted / ⏭ Skip under a lead. The first tap wins (guarded WHERE status='sent'); a later tap is told who
 * marked it. The webhook checks the chat and the person before calling this.
 */
export async function handleLeadCallback(action: LeadAction, id: string, who: { name: string; telegramUserId: string }, queryId: string, chatId: string, messageId: number | undefined, at = new Date()) {
  await ensureLeadTables();
  const res = await db().prepare("UPDATE fb_leads SET status=?,marked_by=?,marked_by_id=?,marked_at=?,updated_at=? WHERE id=? AND status='sent'")
    .bind(action, who.name.slice(0, 80), who.telegramUserId, at.toISOString(), at.toISOString(), id).run();
  const lead = await getLead(id);
  if (!lead) return answerCallback(queryId, "This lead was not found.", true);
  if (!res.meta.changes) return answerCallback(queryId, lead.marked_by ? `Already marked ${lead.status} by ${lead.marked_by}.` : "This lead can't be marked now.", true);
  await answerCallback(queryId, action === "posted" ? "Marked as posted. Thank you!" : "Skipped.");
  const target = lead.link_message_id ?? messageId;
  if (target) await editIn(chatId, target, linkMessage(lead), linkKeyboard(lead)).catch(() => undefined);
}

/** Cron (hourly): post text and comments are cleared after 90 days; the link, group and status stay for the counts. */
export async function purgeOldLeads(now = new Date()) {
  await ensureLeadTables();
  const before = new Date(now.getTime() - LEAD_KEEP_DAYS * 86_400_000).toISOString();
  // A post still waiting by then is closed as failed (there is no text left to draft from).
  await db().prepare("UPDATE fb_leads SET post_text='',comment=NULL,details_html=NULL,keyboard_json=NULL,status=CASE WHEN status IN ('queued','drafting','drafted') THEN 'failed' ELSE status END WHERE created_at<? AND post_text!=''").bind(before).run();
}

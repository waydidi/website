import { env } from "cloudflare:workers";
import { DRAFTING_TIMEOUT_MIN, LEAD_KEEP_DAYS, MAX_ATTEMPTS, REPLY_CLAIM_MIN, autoPostEnabled, dailyLimit, isLead, leadPriority, leadsEnabled, noSalesPitch, normalisedText, reliability, replyDailyCap, replyGapMin, replyQueueEnabled, replyTabUrl, screenPost, thaiDayStart, thaiStamp, type IncomingPost, type LeadAction, type ReplyRequest } from "@/lib/fb-leads-rules";
import { constantTimeEqual } from "@/lib/security";
import { assistantFailure } from "@/lib/assistant-error-rules";
import { esc } from "@/lib/telegram/cards";
import { answerCallback, editIn, sendTo, telegramCommentChatId, type InlineKeyboard, type TelegramMessage } from "@/lib/telegram/client";
import { assistantUsage } from "@/lib/telegram/assistant";
import { draftForPost, postHelperOn, sortForLead, type Draft, type DraftOptions } from "@/lib/telegram/post-helper";
import type { Routed } from "@/lib/post-helper-rules";

// Facebook group leads: posts sent in by a collector are queued here, drafted by the same writer as /c (the owner's
// playbook in Admin → Writing assistant, web facts checked), and sent to the Comment group as two messages: the
// comment alone, then the group, the post link and the checks with Posted / Skip. Nothing is ever posted on Facebook.
// Off until FB_LEADS_ENABLED=true (lib/fb-leads-rules → leadsEnabled).
type Stmt = { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> } };
type Db = { prepare: (sql: string) => Stmt };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
export const fbLeadsOn = () => leadsEnabled(vars());
export const replyQueueOn = () => replyQueueEnabled(vars());
export const autoPostOn = () => autoPostEnabled(vars());

/** The collector token (FB_LEADS_INGEST_TOKEN) in "Authorization: Bearer <token>", compared in constant time. */
export function collectorAuthorized(request: Request) {
  const token = String(vars().FB_LEADS_INGEST_TOKEN ?? "");
  const given = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  return Boolean(given) && constantTimeEqual(given, token);
}

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
    // Added later (drizzle/0121_fb_leads_targeting.sql): why a post was skipped, how strong a lead it is, and its
    // text fingerprint (the same question copied into several groups is collected once).
    for (const col of ["skip_reason TEXT", "priority INTEGER NOT NULL DEFAULT 0", "text_hash TEXT", "routed_json TEXT"])
      await db().prepare(`ALTER TABLE fb_leads ADD COLUMN ${col}`).bind().run().catch(() => undefined);
    // Added later (drizzle/0123_fb_leads_reply_queue.sql): when the extension's reply queue opened this lead in a tab.
    // Who approved "Post to Facebook" in Telegram, and when (same file).
    // And the ส่ง Comment message under the lead while its comment waits in Chrome (drizzle/0124_fb_leads_send_from_telegram.sql).
    for (const col of ["reply_claimed_at TEXT", "post_approved_by TEXT", "post_approved_at TEXT", "ready_message_id INTEGER"])
      await db().prepare(`ALTER TABLE fb_leads ADD COLUMN ${col}`).bind().run().catch(() => undefined);
    for (const sql of ["CREATE INDEX IF NOT EXISTS fb_leads_queue ON fb_leads(status, priority, created_at)", "CREATE INDEX IF NOT EXISTS fb_leads_text ON fb_leads(text_hash, created_at)", "CREATE INDEX IF NOT EXISTS fb_leads_marked ON fb_leads(status, marked_at)"])
      await db().prepare(sql).bind().run();
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
/** The sorter answer stored when the post arrived, or none (then drafting sorts it). Written by queueLeads only. */
function storedRouted(json: string | null | undefined): Routed | undefined {
  if (!json) return undefined;
  try { const r = JSON.parse(json) as Routed; return r && typeof r.topic === "string" && typeof r.replyType === "string" ? r : undefined; } catch { return undefined; }
}

type Sorter = (text: string, groupName: string) => Promise<{ routed: Routed; skipReason: string }>;
const SORT_AT_ONCE = 4;

/** The AI sorter for arriving posts, while the assistant is on and this month's budget allows; otherwise none. */
async function arrivalSorter(): Promise<Sorter | null> {
  if (!postHelperOn()) return null;
  const usage = await assistantUsage();
  return usage.usd + 0.05 < usage.capUsd ? (text, groupName) => sortForLead(text, groupName) : null;
}

/**
 * Queues posts; a post already sent in (same group and post) is ignored, so collectors may send the same post again.
 * A post that failed is queued again when it is sent in again. Each new post is checked, in order:
 * 1. free: what the extension saw on the page, the word rules (lib/fb-leads-rules → screenPost), a copy from another group;
 * 2. the AI sorter (about US$0.0003), straight away, so the collector learns at once how many real leads it found and
 *    a Collect run counts only those. Its answer is stored and reused when drafting. If it fails or the budget is
 *    reached, the post stays queued and is sorted at drafting time instead.
 * A skipped post is stored as "not a lead" with its reason, and gets no message.
 */
export async function queueLeads(posts: IncomingPost[], now = new Date(), deps: { sort?: Sorter | null } = {}) {
  await ensureLeadTables();
  const at = now.toISOString(), since = new Date(now.getTime() - CROSS_POST_DAYS * 86_400_000).toISOString();
  type Checked = { p: IncomingPost; id: string; hash: string; reason: string | null; routed: Routed | null };
  const fresh: Checked[] = [];
  for (const p of posts) {
    const id = await leadId(p.groupKey, p.postKey);
    const existing = await db().prepare("SELECT status FROM fb_leads WHERE id=?").bind(id).first<{ status: string }>();
    if (existing && existing.status !== "failed") continue; // already here: no AI, counted as a duplicate
    const screen = screenPost(p.text), hash = await textHash(p.text);
    let reason: string | null = p.skip ?? (screen.queue ? null : screen.reason);
    if (!reason && await db().prepare("SELECT 1 AS x FROM fb_leads WHERE text_hash=? AND group_key<>? AND created_at>=? LIMIT 1").bind(hash, p.groupKey, since).first()) reason = "cross_posted";
    fresh.push({ p, id, hash, reason, routed: null });
  }

  const toSort = fresh.filter((c) => !c.reason);
  const sort = toSort.length ? (deps.sort !== undefined ? deps.sort : await arrivalSorter()) : null;
  for (let i = 0; sort && i < toSort.length; i += SORT_AT_ONCE) {
    await Promise.all(toSort.slice(i, i + SORT_AT_ONCE).map(async (c) => {
      try { const s = await sort(c.p.text, c.p.groupName); c.routed = s.routed; if (s.skipReason) c.reason = s.skipReason; }
      catch (error) { console.error("fb lead sort failed", error instanceof Error ? error.message : "unknown"); } // sorted at drafting instead
    }));
  }

  let accepted = 0, skipped = 0;
  for (const c of fresh) {
    const p = c.p, routedJson = c.routed ? JSON.stringify(c.routed) : null;
    const res = await db().prepare("INSERT OR IGNORE INTO fb_leads(id,group_key,group_name,post_key,post_url,post_text,status,skip_reason,priority,text_hash,routed_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(group_key,post_key) DO UPDATE SET status=excluded.status,skip_reason=excluded.skip_reason,routed_json=excluded.routed_json,attempts=0,post_text=excluded.post_text,group_name=excluded.group_name,updated_at=excluded.updated_at WHERE fb_leads.status='failed'")
      .bind(c.id, p.groupKey, p.groupName, p.postKey, p.url, p.text, c.reason ? "not_lead" : "queued", c.reason, c.reason ? 0 : leadPriority(p.text), c.hash, routedJson, at, at).run();
    accepted += res.meta.changes;
    if (res.meta.changes && c.reason) skipped++;
  }
  return { accepted, duplicates: posts.length - accepted, skipped };
}
const CROSS_POST_DAYS = 7;
const textHash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalisedText(text))))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");

type Lead = { id: string; group_name: string; post_url: string; post_text: string; routed_json?: string | null; status: string; attempts: number; reliable: number | null; comment: string | null; details_html: string | null; keyboard_json: string | null; comment_message_id: number | null; link_message_id: number | null; marked_by: string | null; marked_at: string | null; post_approved_by?: string | null; post_approved_at?: string | null; ready_message_id?: number | null };
const COLS = "id,group_name,post_url,post_text,routed_json,status,attempts,reliable,comment,details_html,keyboard_json,comment_message_id,link_message_id,marked_by,marked_at,post_approved_by,post_approved_at,ready_message_id";
const getLead = (id: string) => db().prepare(`SELECT ${COLS} FROM fb_leads WHERE id=?`).bind(id).first<Lead>();

const STATUS_LINE = { posted: "✅ Posted", skipped: "⏭ Skipped" } as const;
/**
 * The second message, kept short (owner's choice): the group, the post link and "Check before posting · <type>".
 * One more line only when it matters: why it is not ready to post, or who marked it Posted / Skipped.
 * The full checks (sources, dates) stay stored in details_html; they are not shown.
 */
function linkMessage(lead: Lead) {
  const paragraphs = (lead.details_html ?? "").split("\n\n");
  const type = paragraphs.find((p) => p.startsWith("<b>Check before posting</b>")) ?? "<b>Check before posting</b>";
  const notReady = lead.reliable === 0 ? paragraphs.find((p) => p.startsWith("⚠️ Not ready to post:"))?.split(". ")[0] ?? "⚠️ Not ready to post" : "";
  const lines = [type, ...(notReady ? [notReady] : [])];
  if (lead.marked_by && (lead.status === "posted" || lead.status === "skipped")) lines.push(`<b>${STATUS_LINE[lead.status]}</b> by ${esc(lead.marked_by)} · ${esc(thaiStamp(new Date(lead.marked_at ?? Date.now())))}`);
  return `📌 <b>${esc(lead.group_name)}</b>\n${esc(lead.post_url)}\n\n${lines.join("\n")}`;
}
/** Only two buttons, without emoji (owner's choice); once someone taps one, the buttons are removed. */
/**
 * Only two buttons normally (owner's choice: no Open post, Search again or Wrong or outdated). One exception: when
 * this question has come up often enough that draftForPost already offers "Save as knowledge" (so the next repeat,
 * from a lead or from /c, skips the search), that single button is kept too — without it, a question that only ever
 * arrives as automatic leads could never be saved, and the owner would have to paste it into /c by hand to save it.
 */
function linkKeyboard(lead: Lead): InlineKeyboard {
  if (lead.status !== "sent") return [];
  const rows: InlineKeyboard = [[{ text: "Posted", callback_data: `fl_posted:${lead.id}` }, { text: "Skip", callback_data: `fl_skip:${lead.id}` }]];
  // With the reply queue on, one more button opens the post in the browser that has the extension, which puts the
  // comment in Facebook's comment box for a person to check and post. Only for drafts that are ready to post.
  if (replyQueueOn() && lead.reliable !== 0) rows.push([{ text: "Open in Chrome", url: replyTabUrl(lead.post_url, lead.id) }]);
  const saveRow = (JSON.parse(lead.keyboard_json ?? "[]") as InlineKeyboard).find((row) => row.some((b) => (b.callback_data ?? "").startsWith("ph_save:")));
  if (saveRow) rows.push(saveRow.map((b) => ({ ...b, text: b.text.replace(/^💾\s*/, "") }))); // no emoji, to match Posted/Skip
  return rows;
}

type Deps = { draft?: (text: string, options: DraftOptions) => Promise<Draft>; send?: (chatId: string, text: string, keyboard?: InlineKeyboard) => Promise<TelegramMessage>; now?: () => Date };

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
  // The cheap way (see DraftOptions in post-helper): social posts stop after sorting, booking requests skip the web
  // search, everything else gets one search instead of two.
  // "No agents, please" posts get a helpful comment with no sales pitch.
  // The group the post came from: the comment answers for its place (a Koh Chang group gets Koh Chang answers).
  const options: DraftOptions = { leadsOnly: true, maxSearches: 1, noSearchForBookings: true, noSalesPitch: noSalesPitch(lead.post_text), groupName: lead.group_name, routed: storedRouted(lead.routed_json) };
  const draft = await (deps.draft ?? ((text: string, o: DraftOptions) => draftForPost(text, {}, o)))(lead.post_text, options);
  const at = (deps.now ?? (() => new Date()))().toISOString();
  // The AI sorter's verdict (chat, an advert, news, a giveaway, bait, a meme, spam, not Thailand) gets no message.
  const skip = draft.skipReason || (draft.advert ? "advert" : !isLead(draft.replyType) ? "chat" : "");
  if (skip) {
    await db().prepare("UPDATE fb_leads SET status='not_lead',skip_reason=?,reply_type=?,draft_id=?,updated_at=? WHERE id=? AND status='drafting'").bind(skip, skip === "advert" ? "advert" : draft.replyType, draft.id, at, lead.id).run();
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
  const { results: queued } = await db().prepare(`SELECT ${COLS} FROM fb_leads WHERE status='queued' ORDER BY priority DESC, created_at, rowid LIMIT ?`).bind(deps.batch ?? 2).all<Lead>();
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
 * Marks a lead Posted or Skipped. The first mark wins (guarded WHERE status='sent'), so a Telegram tap and the
 * extension at the same moment cannot both count; the Telegram link message is updated to show who marked it.
 */
async function markLead(action: LeadAction, id: string, who: { name: string; telegramUserId: string }, at: Date, edit: { chatId?: string; messageId?: number } = {}) {
  const res = await db().prepare("UPDATE fb_leads SET status=?,marked_by=?,marked_by_id=?,marked_at=?,reply_claimed_at=NULL,updated_at=? WHERE id=? AND status='sent'")
    .bind(action, who.name.slice(0, 80), who.telegramUserId, at.toISOString(), at.toISOString(), id).run();
  const lead = await getLead(id);
  const target = lead?.link_message_id ?? edit.messageId;
  if (res.meta.changes && lead && target) await editIn(edit.chatId ?? telegramCommentChatId(), target, linkMessage(lead), linkKeyboard(lead)).catch(() => undefined);
  // A ส่ง Comment message under the lead shows the result too and loses its buttons.
  if (res.meta.changes && lead) await showReady(lead, action === "posted" ? "posted" : "skipped");
  return { changed: res.meta.changes > 0, lead };
}

/** Posted / Skip under a lead. A later tap is told who marked it. The webhook checks the chat and the person first. */
export async function handleLeadCallback(action: LeadAction, id: string, who: { name: string; telegramUserId: string }, queryId: string, chatId: string, messageId: number | undefined, at = new Date()) {
  await ensureLeadTables();
  const { changed, lead } = await markLead(action, id, who, at, { chatId, messageId });
  if (!lead) return answerCallback(queryId, "This lead was not found.", true);
  if (!changed) return answerCallback(queryId, lead.marked_by ? `Already marked ${lead.status} by ${lead.marked_by}.` : "This lead can't be marked now.", true);
  await answerCallback(queryId, action === "posted" ? "Marked as posted. Thank you!" : "Skipped.");
}

/** Seconds Chrome waits after "ส่ง Comment" is tapped before it presses send (owner's choice). */
export const SEND_DELAY_SECONDS = 15;
type ReadyState = "waiting" | "approved" | "posted" | "skipped" | "failed" | "closed";
/**
 * The message under a lead while its comment waits in Chrome (send from Telegram, FB_LEADS_AUTO_POST_ENABLED). Staff
 * text, so in Thai. Only the waiting message has buttons: ส่ง Comment and ข้าม.
 */
function readyMessage(lead: Lead, state: ReadyState): { text: string; keyboard: InlineKeyboard } {
  const where = `${esc(lead.group_name)}\n${esc(lead.post_url)}`;
  const text = {
    waiting: `📝 <b>วางคอมเมนต์ใน Chrome แล้ว รอส่ง</b> · ${where}\n\n${esc(lead.comment ?? "")}\n\nกด <b>ส่ง Comment</b> แล้ว Chrome จะส่งใน ${SEND_DELAY_SECONDS} วินาที`,
    approved: `⏳ <b>${esc(lead.post_approved_by ?? "")} กดส่งแล้ว</b> · Chrome จะส่งใน ${SEND_DELAY_SECONDS} วินาที · ${where}`,
    posted: `✅ <b>โพสต์บน Facebook แล้ว</b> จาก Chrome · ${where}`,
    skipped: `⏭ <b>ข้ามแล้ว</b> · ${where}`,
    failed: `⚠️ <b>Chrome ส่งคอมเมนต์ไม่ได้</b> กรุณาโพสต์เอง · ${where}`,
    closed: `⏹ <b>ปิดแท็บแล้ว ยังไม่ได้ส่ง</b> ลีดกลับเข้าคิว · ${where}`,
  }[state];
  const keyboard: InlineKeyboard = state === "waiting" ? [[{ text: "ส่ง Comment", callback_data: `fl_go:${lead.id}` }, { text: "ข้าม", callback_data: `fl_skip:${lead.id}` }]] : [];
  return { text, keyboard };
}
async function showReady(lead: Lead, state: ReadyState) {
  if (!lead.ready_message_id) return;
  const m = readyMessage(lead, state);
  await editIn(telegramCommentChatId(), lead.ready_message_id, m.text, m.keyboard).catch(() => undefined);
}

/**
 * ส่ง Comment under a comment waiting in Chrome (off until FB_LEADS_AUTO_POST_ENABLED=true): a team member approves
 * it and Chrome presses send SEND_DELAY_SECONDS later. Team members only (the webhook passes isTeam); the first tap
 * wins; only while the comment is really waiting in an open tab.
 */
export async function handleLeadApprove(id: string, who: { name: string; telegramUserId: string; isTeam: boolean }, queryId: string, chatId: string, messageId: number | undefined, at = new Date()) {
  if (!autoPostOn()) return answerCallback(queryId, "การส่งจาก Telegram ปิดอยู่", true);
  if (!who.isTeam) return answerCallback(queryId, `เฉพาะทีม Waydidi เท่านั้นที่กดส่งได้ ขอให้เจ้าของเพิ่ม Telegram ID ของคุณ: ${who.telegramUserId}`, true);
  await ensureLeadTables();
  const lapsed = new Date(at.getTime() - REPLY_CLAIM_MIN * 60_000).toISOString();
  const res = await db().prepare("UPDATE fb_leads SET post_approved_by=?,post_approved_at=?,updated_at=? WHERE id=? AND status='sent' AND ready_message_id IS NOT NULL AND reply_claimed_at>=? AND post_approved_at IS NULL")
    .bind(who.name.slice(0, 80), at.toISOString(), at.toISOString(), id, lapsed).run();
  const lead = await getLead(id);
  if (!lead) return answerCallback(queryId, "ไม่พบลีดนี้", true);
  if (!res.meta.changes) return answerCallback(queryId, lead.post_approved_by ? `${lead.post_approved_by} กดส่งไปแล้ว` : "ตอนนี้ส่งลีดนี้ไม่ได้ (แท็บใน Chrome ปิดไปแล้ว หรือมีคนกดไปแล้ว)", true);
  await answerCallback(queryId, `กดส่งแล้ว Chrome จะส่งใน ${SEND_DELAY_SECONDS} วินาที`);
  const m = readyMessage(lead, "approved"), target = lead.ready_message_id ?? messageId;
  if (target) await editIn(chatId, target, m.text, m.keyboard).catch(() => undefined);
}

export type ReplyLead = { id: string; url: string; comment: string; groupName: string };
export type ReplyAnswer = { lead: ReplyLead } | { wait: "limit" | "empty" } | { wait: "gap"; retryAt: string } | { done: "posted" | "skipped" | "released" | "failed" | "ready" } | { status: string; approved: boolean } | { error: "already_marked" | "not_found" | "off" };
const EXTENSION = { name: "Chrome extension", telegramUserId: "extension" };

/**
 * The extension's reply queue (off until FB_LEADS_REPLY_QUEUE_ENABLED=true).
 * - next: hands out one lead that was sent to Telegram, is ready to post and is not open in another tab (strongest and
 *   newest first), or the one asked for by id (the Telegram "Open in Chrome" button). The daily cap
 *   (FB_LEADS_REPLY_DAILY_CAP) and the gap since the last posted comment (FB_LEADS_REPLY_GAP_MIN) are checked in the
 *   same statement as the claim, so two browsers at once cannot pass either. A claim lapses after REPLY_CLAIM_MIN.
 * - posted / skipped: same as the Telegram buttons; the first mark wins.
 * - release: the tab was closed without posting; the lead goes back to the queue.
 * - ready / status (send from Telegram, FB_LEADS_AUTO_POST_ENABLED): the comment is in Chrome's comment box; the team
 *   gets a message under the lead with ส่ง Comment, and Chrome asks every few seconds whether it was tapped.
 * - auto_failed: Chrome could not send an approved comment; the team is told to post it by hand.
 * Nothing here posts on Facebook: a person presses Post there, or taps ส่ง Comment and Chrome presses it.
 */
export async function replyQueue(req: ReplyRequest, now = new Date()): Promise<ReplyAnswer> {
  await ensureLeadTables();
  const at = now.toISOString();
  if (req.action === "release") {
    // The tab was closed without posting: back in the queue; a waiting ส่ง Comment message says so and loses its buttons.
    const before = await getLead(req.id);
    const res = await db().prepare("UPDATE fb_leads SET reply_claimed_at=NULL,ready_message_id=NULL,post_approved_by=NULL,post_approved_at=NULL,updated_at=? WHERE id=? AND status='sent'").bind(at, req.id).run();
    if (res.meta.changes && before) await showReady(before, "closed");
    return { done: "released" };
  }
  if (req.action === "posted" || req.action === "skipped") {
    const { changed, lead } = await markLead(req.action, req.id, EXTENSION, now);
    if (!lead) return { error: "not_found" };
    if (!changed) return { error: "already_marked" };
    // A comment posted from Chrome is announced under the lead, so the team sees it (an edit to an older message is
    // easy to miss): the ส่ง Comment message is updated when there is one (markLead), otherwise a new message.
    if (req.action === "posted" && !lead.ready_message_id) {
      await sendTo(telegramCommentChatId(), `✅ <b>Posted on Facebook</b> from Chrome · ${esc(lead.group_name)}\n${esc(lead.post_url)}`, undefined, lead.link_message_id ?? undefined)
        .catch((error) => console.error("fb lead posted notice failed", error instanceof Error ? error.message : "unknown"));
    }
    return { done: req.action };
  }
  if (req.action === "ready" || req.action === "status") {
    if (!autoPostOn()) return { error: "off" };
    // Chrome is still on it: the claim is renewed, so a comment waiting for ส่ง Comment is not handed to another tab.
    const res = await db().prepare("UPDATE fb_leads SET reply_claimed_at=?,updated_at=? WHERE id=? AND status='sent' AND reply_claimed_at IS NOT NULL").bind(at, at, req.id).run();
    const lead = await getLead(req.id);
    if (!lead) return { error: "not_found" };
    if (req.action === "status" || !res.meta.changes) return { status: lead.status, approved: Boolean(lead.post_approved_at) };
    // ready: the comment is in the box. The team is told under the lead, with ส่ง Comment (once per tab; a reload of
    // the same tab updates the same message).
    const m = readyMessage(lead, lead.post_approved_at ? "approved" : "waiting");
    if (lead.ready_message_id) await editIn(telegramCommentChatId(), lead.ready_message_id, m.text, m.keyboard).catch(() => undefined);
    else {
      const sent = await sendTo(telegramCommentChatId(), m.text, m.keyboard, lead.link_message_id ?? undefined);
      await db().prepare("UPDATE fb_leads SET ready_message_id=? WHERE id=? AND ready_message_id IS NULL").bind(sent.message_id, req.id).run();
    }
    return { done: "ready" };
  }
  if (req.action === "auto_failed") {
    // Chrome could not send it (the comment never appeared, or the tab was closed after ส่ง Comment). The approval is
    // cleared, so it is never retried by itself, and the team is told to post it by hand.
    const before = await getLead(req.id);
    const res = await db().prepare("UPDATE fb_leads SET post_approved_by=NULL,post_approved_at=NULL,reply_claimed_at=NULL,ready_message_id=NULL,updated_at=? WHERE id=? AND status='sent' AND (post_approved_at IS NOT NULL OR ready_message_id IS NOT NULL)").bind(at, req.id).run();
    if (!before) return { error: "not_found" };
    if (!res.meta.changes) return { error: "already_marked" };
    if (before.ready_message_id) await showReady(before, "failed");
    else await sendTo(telegramCommentChatId(), `⚠️ <b>Chrome ส่งคอมเมนต์ไม่ได้</b> กรุณาโพสต์เอง · ${esc(before.group_name)}\n${esc(before.post_url)}`, undefined, before.link_message_id ?? undefined).catch(() => undefined);
    return { done: "failed" };
  }
  const cap = replyDailyCap(vars().FB_LEADS_REPLY_DAILY_CAP), gapMs = replyGapMin(vars().FB_LEADS_REPLY_GAP_MIN) * 60_000;
  const dayStart = thaiDayStart(now), gapStart = new Date(now.getTime() - gapMs).toISOString();
  const lapsed = new Date(now.getTime() - REPLY_CLAIM_MIN * 60_000).toISOString();
  const open = "status='sent' AND reliable=1 AND COALESCE(comment,'')<>'' AND (reply_claimed_at IS NULL OR reply_claimed_at<?)";
  const pick = req.id ? `SELECT id FROM fb_leads WHERE id=? AND ${open}` : `SELECT id FROM fb_leads WHERE ${open} ORDER BY priority DESC, created_at DESC LIMIT 1`;
  // The claim, the daily cap and the gap are one statement, so two browsers at once cannot pass either. A new claim
  // starts clean: no ส่ง Comment message or approval left from an earlier tab.
  const claimed = await db().prepare(`UPDATE fb_leads SET reply_claimed_at=?,ready_message_id=NULL,post_approved_by=NULL,post_approved_at=NULL,updated_at=? WHERE id=(${pick}) AND ${open}
      AND (SELECT COUNT(*) FROM fb_leads WHERE status='posted' AND marked_at>=?)<?
      AND NOT EXISTS (SELECT 1 FROM fb_leads WHERE status='posted' AND marked_at>?)
      RETURNING id,post_url,comment,group_name`)
    .bind(at, at, ...(req.id ? [req.id] : []), lapsed, lapsed, dayStart, cap, gapStart).first<{ id: string; post_url: string; comment: string; group_name: string }>();
  if (claimed) return { lead: { id: claimed.id, url: replyTabUrl(claimed.post_url, claimed.id), comment: claimed.comment, groupName: claimed.group_name } };
  // Nothing claimed: say why, so the extension waits or stops.
  const posted = await db().prepare("SELECT COUNT(*) AS n, MAX(marked_at) AS last FROM fb_leads WHERE status='posted' AND marked_at>=?").bind(dayStart).first<{ n: number; last: string | null }>();
  if ((posted?.n ?? 0) >= cap) return { wait: "limit" };
  if (posted?.last && posted.last > gapStart) return { wait: "gap", retryAt: new Date(new Date(posted.last).getTime() + gapMs).toISOString() };
  return { wait: "empty" };
}

/** Cron (hourly): post text and comments are cleared after 90 days; the link, group and status stay for the counts. */
export async function purgeOldLeads(now = new Date()) {
  await ensureLeadTables();
  const before = new Date(now.getTime() - LEAD_KEEP_DAYS * 86_400_000).toISOString();
  // A post still waiting by then is closed as failed (there is no text left to draft from).
  await db().prepare("UPDATE fb_leads SET post_text='',comment=NULL,details_html=NULL,keyboard_json=NULL,status=CASE WHEN status IN ('queued','drafting','drafted') THEN 'failed' ELSE status END WHERE created_at<? AND post_text!=''").bind(before).run();
}

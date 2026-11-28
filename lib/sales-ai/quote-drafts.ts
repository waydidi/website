import { env } from "cloudflare:workers";
import { crmAction } from "@/lib/crm";
import { sha256 } from "@/lib/security";
import { getMessages, translate } from "@/lib/i18n";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
import { recommendVehicles } from "@/lib/vehicle-recommendation";
import { addBotMessage, assign } from "@/lib/website-chat";
import { editCard, sendCard, telegramChatId, telegramConfigured, tg, type TelegramMessage, type TelegramUser } from "@/lib/telegram/client";
import { activityRetentionDays, logActivity } from "./activity-log";
import { CHILD_SEAT_THB } from "@/lib/addons";
import { salesMediaOn } from "./media-flag";
import { MAX_CHILD_SEATS, NO_NEEDS, eligibleVehicles, filterCars, hasNeeds, needsLines, needsOwnerPrice, type VehicleNeeds } from "./vehicle-needs";
import {
  QUOTE_VALID_MS, DRAFT_REVIEW_MS, approvalBlocker, approvalChannels, customerLocale, draftCard, draftKeyboard, options,
  parsePriceReply, parseQuoteCallback, type Draft, type DraftLeg, type DraftOption, MAX_LEGS, legsTotal,
} from "./quote-rules";

// AI quote drafts (Sales Intelligence PR 2). On channels listed in SALES_AI_QUOTE_APPROVAL, the assistant's
// transfer prices are not shown to the customer: they become a draft that the owner approves in Telegram.
// Approval creates a CRM quote (valid 3 hours) and sends the customer its link. Only the owner may act.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
const nowIso = () => new Date().toISOString();

// Same statements as drizzle/0128_ai_quote_drafts.sql (Workers Builds does not apply D1 migrations).
export const QUOTE_TABLES = [
  `CREATE TABLE IF NOT EXISTS ai_quote_drafts(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approving','sending','sent','undelivered','rejected','superseded','taken_over','expired')),revision INTEGER NOT NULL DEFAULT 1,pickup TEXT NOT NULL,dropoff TEXT NOT NULL,trip_date TEXT NOT NULL,trip_time TEXT NOT NULL,passengers INTEGER NOT NULL,bags INTEGER NOT NULL,summary TEXT NOT NULL,price_source TEXT NOT NULL CHECK(price_source IN ('price_table','manual')),options_json TEXT NOT NULL,selected INTEGER NOT NULL DEFAULT 0,price_thb INTEGER,table_price_thb INTEGER,edited_by TEXT,visitor_seq INTEGER NOT NULL,telegram_message_id INTEGER,crm_quote_id TEXT,note TEXT,quote_expires_at TEXT,decided_by TEXT,decided_at TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_quote_drafts_conversation ON ai_quote_drafts(conversation_id,status)`,
  `CREATE TABLE IF NOT EXISTS ai_quote_prompts(telegram_message_id INTEGER PRIMARY KEY,draft_id TEXT NOT NULL,revision INTEGER NOT NULL,telegram_user_id TEXT NOT NULL,created_at TEXT NOT NULL)`,
  // PR 4, children of a draft (drizzle/0129_sales_ai_media.sql): the legs of a multi-leg draft and special needs.
  `CREATE TABLE IF NOT EXISTS ai_quote_legs(draft_id TEXT NOT NULL,leg_no INTEGER NOT NULL,pickup TEXT NOT NULL,dropoff TEXT NOT NULL,trip_date TEXT NOT NULL,trip_time TEXT NOT NULL,passengers INTEGER NOT NULL,bags INTEGER NOT NULL,options_json TEXT NOT NULL,selected INTEGER NOT NULL DEFAULT 0,price_thb INTEGER,table_price_thb INTEGER,edited INTEGER NOT NULL DEFAULT 0,crm_quote_id TEXT,crm_version INTEGER,PRIMARY KEY(draft_id,leg_no))`,
  `CREATE INDEX IF NOT EXISTS ai_quote_legs_quote ON ai_quote_legs(crm_quote_id)`,
  `CREATE TABLE IF NOT EXISTS ai_quote_leg_prompts(telegram_message_id INTEGER PRIMARY KEY,leg_no INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_quote_needs(draft_id TEXT PRIMARY KEY,child_seats INTEGER NOT NULL DEFAULT 0)`,
];
let ready: Promise<unknown> | null = null;
export function ensureQuoteTables() {
  ready ??= db().batch(QUOTE_TABLES.map((sql) => db().prepare(sql))).catch((error) => { ready = null; throw error; });
  return ready;
}

export const quoteApprovalRequired = (channel: string | null | undefined) => approvalChannels(vars().SALES_AI_QUOTE_APPROVAL).has(channel ?? "web");

const PENDING_REPLY = JSON.stringify({ ok: true, pending_approval: true,
  instruction: "A Waydidi team member is confirming the price. In one short line in the customer's language, say the confirmed price will be sent in this chat shortly. Do not mention, estimate or compare any price, and do not call handover." });

type QuoteInput = { pickup: string; dropoff: string; date: string; time: string; passengers: number; bags: number };
type QuoteResult = { ok: true; kind: string; summary: string; cars: { vehicle: string; name: string; price: number }[]; notes: string[] } | { ok: false; reason: string; handover: boolean };

const latestVisitorSeq = async (conversationId: string) =>
  (await db().prepare("SELECT COALESCE(MAX(rowid),0) seq FROM website_chat_messages WHERE conversation_id=? AND sender='visitor'").bind(conversationId).first<{ seq: number }>())?.seq ?? 0;
const conversation = (id: string) => db().prepare("SELECT id,public_id,status,assigned_staff_id,assigned_name,bot_thinking_at,telegram_message_id FROM website_conversations WHERE id=?").bind(id)
  .first<{ id: string; public_id: string | null; status: string; assigned_staff_id: string | null; assigned_name: string | null; bot_thinking_at: string | null; telegram_message_id: number | null }>();
export const legsFor = async (draftId: string) => { await ensureQuoteTables(); return (await db().prepare("SELECT * FROM ai_quote_legs WHERE draft_id=? ORDER BY leg_no").bind(draftId).all<DraftLeg>()).results; };
export const draftById = async (id: string) => { await ensureQuoteTables(); return db().prepare("SELECT * FROM ai_quote_drafts WHERE id=?").bind(id).first<Draft>(); };

async function refreshDraftCard(id: string) {
  const d = await draftById(id);
  if (!d?.telegram_message_id || !telegramConfigured()) return;
  const c = await conversation(d.conversation_id);
  const legs = await legsFor(id);
  await editCard(d.telegram_message_id, draftCard(d, c?.public_id ?? null, await latestVisitorSeq(d.conversation_id), legs), draftKeyboard(d, legs)).catch(() => undefined);
}

type LegDraft = QuoteInput & { options: DraftOption[]; priced: boolean; summary: string };

/** One transfer as draft options, or null when it cannot even be offered as "needs your price". */
function legDraft(input: QuoteInput, result: QuoteResult, needs: VehicleNeeds): LegDraft | null {
  if (needs.childSeats > input.passengers || needs.childSeats > MAX_CHILD_SEATS) return null;
  const cars = result.ok ? filterCars(result.cars, needs) : [];
  if (result.ok && cars.length && !needsOwnerPrice(needs))
    return { ...input, options: cars.slice(0, 4).map((c) => ({ vehicle: c.vehicle, name: c.name, price: c.price })), priced: true, summary: result.summary };
  // No published price, or a need the tables don't cover: the owner types the price (decision D20).
  if (!result.ok && !result.handover) return null;
  const best = input.passengers <= 10 ? recommendVehicles(input.passengers, input.bags, "", eligibleVehicles(needs)).best : null;
  if (!best) return null;
  const table = cars.find((c) => c.vehicle === best)?.price ?? null;
  return { ...input, options: [{ vehicle: best, name: VEHICLES[best].name, price: null }], priced: false,
    summary: `${input.pickup} → ${input.dropoff}, ${input.date} at ${input.time}${table === null ? "" : ` (table price without the special need: ฿${table.toLocaleString("en-US")})`}` };
}

/** Sent multi-leg quotes stop being acceptable as soon as the same chat gets a newer draft. */
const supersedeSentLegQuotes = (conversationId: string, stamp: string) =>
  db().prepare("UPDATE ai_quote_drafts SET status='superseded',revision=revision+1,updated_at=? WHERE conversation_id=? AND status IN ('sending','sent','undelivered') AND id IN (SELECT draft_id FROM ai_quote_legs)").bind(stamp, conversationId);

/** Saves the draft (and its legs), posts the owner's card and returns what the assistant may tell the customer. */
async function saveDraft(conversationId: string, channel: string, legs: LegDraft[], needs: VehicleNeeds): Promise<string> {
  if (!telegramConfigured()) return JSON.stringify({ ok: false, reason: "Prices need the team's approval and the team channel is not connected; hand over to staff.", handover: true });
  await ensureQuoteTables();
  const multi = legs.length > 1;
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = new Date(), stamp = now.toISOString(), seq = await latestVisitorSeq(conversationId);
  // The earliest pickup drives the "less than 3 hours away" check.
  const first = [...legs].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
  const source: Draft["price_source"] = legs.every((l) => l.priced) ? "price_table" : "manual";
  const opts = multi ? [] : legs[0].options;
  const price = multi ? legsTotal(legs.map((l) => ({ price_thb: l.options[0].price }))) : opts[0].price;
  const summary = [multi ? `${legs.length} transfers, first on ${first.date} at ${first.time}` : legs[0].summary, ...needsLines(needs)].join("\n").slice(0, 500);
  const older = (await db().prepare("SELECT id FROM ai_quote_drafts WHERE conversation_id=? AND (status='pending' OR (status IN ('sending','sent','undelivered') AND id IN (SELECT draft_id FROM ai_quote_legs)))").bind(conversationId).all<{ id: string }>()).results;
  await db().batch([
    db().prepare("UPDATE ai_quote_drafts SET status='superseded',revision=revision+1,updated_at=? WHERE conversation_id=? AND status='pending'").bind(stamp, conversationId),
    supersedeSentLegQuotes(conversationId, stamp),
    db().prepare(`INSERT INTO ai_quote_drafts(id,conversation_id,channel,status,pickup,dropoff,trip_date,trip_time,passengers,bags,summary,price_source,options_json,selected,price_thb,table_price_thb,visitor_seq,expires_at,created_at,updated_at)
      VALUES(?,?,?,'pending',?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`).bind(id, conversationId, channel, first.pickup.slice(0, 300), first.dropoff.slice(0, 300), first.date, first.time, first.passengers, first.bags,
      summary, source, JSON.stringify(opts), price, price, seq, new Date(now.getTime() + DRAFT_REVIEW_MS).toISOString(), stamp, stamp),
    ...(multi ? legs.map((l, i) => db().prepare("INSERT INTO ai_quote_legs(draft_id,leg_no,pickup,dropoff,trip_date,trip_time,passengers,bags,options_json,selected,price_thb,table_price_thb) VALUES(?,?,?,?,?,?,?,?,?,0,?,?)")
      .bind(id, i + 1, l.pickup.slice(0, 300), l.dropoff.slice(0, 300), l.date, l.time, l.passengers, l.bags, JSON.stringify(l.options), l.options[0].price, l.options[0].price)) : []),
    ...(needs.childSeats ? [db().prepare("INSERT INTO ai_quote_needs(draft_id,child_seats) VALUES(?,?)").bind(id, needs.childSeats)] : []),
  ]);
  for (const o of older) await refreshDraftCard(o.id);
  const d = (await draftById(id))!, c = await conversation(conversationId), saved = await legsFor(id);
  try {
    const sent = await sendCard(draftCard(d, c?.public_id ?? null, seq, saved), draftKeyboard(d, saved), c?.telegram_message_id ?? undefined) as TelegramMessage;
    await db().prepare("UPDATE ai_quote_drafts SET telegram_message_id=? WHERE id=?").bind(sent.message_id, id).run();
  } catch (error) {
    // Without a card nobody can approve: the draft is withdrawn and the chat goes to staff.
    await db().prepare("UPDATE ai_quote_drafts SET status='expired',updated_at=? WHERE id=?").bind(nowIso(), id).run();
    console.error("quote draft card failed", error instanceof Error ? error.message : "unknown");
    return JSON.stringify({ ok: false, reason: "The team could not be reached to confirm the price; hand over to staff.", handover: true });
  }
  await logActivity({ event: "quote_drafted", status: "ok", actor: "assistant", channel, conversationId, correlationId: id,
    summary: `Quote draft ${id} for owner approval (${multi ? `${legs.length} legs` : source === "manual" ? "needs a price" : `${opts.length} car option(s) from price tables`}${hasNeeds(needs) ? ", special needs" : ""})`,
    detail: { draft: id, source, legs: legs.length, options: opts.map((o) => ({ vehicle: o.vehicle, price: o.price })) } });
  return PENDING_REPLY;
}

/**
 * Called by the assistant's quote_transfer tool on an approval channel. Saves the server's prices as a draft,
 * posts the owner's card and returns what the assistant may tell the customer (never a price).
 * Unpriceable routes that a single car can serve become a "needs your price" draft.
 */
export async function draftFromQuote(conversationId: string, channel: string, input: QuoteInput, result: QuoteResult, needs: VehicleNeeds = NO_NEEDS): Promise<string> {
  const leg = legDraft(input, result, needs);
  if (!leg) return JSON.stringify(result.ok ? { ok: false, reason: "No single car fits this request; hand over to staff.", handover: true } : result);
  if (salesMediaOn()) {
    // A second, different transfer for the same message would silently replace the first: ask for one multi-leg call.
    await ensureQuoteTables();
    const seq = await latestVisitorSeq(conversationId);
    const same = await db().prepare("SELECT pickup,dropoff,trip_date,trip_time FROM ai_quote_drafts WHERE conversation_id=? AND status='pending' AND visitor_seq=? AND id NOT IN (SELECT draft_id FROM ai_quote_legs)").bind(conversationId, seq)
      .first<{ pickup: string; dropoff: string; trip_date: string; trip_time: string }>();
    if (same && (same.pickup !== input.pickup.slice(0, 300) || same.dropoff !== input.dropoff.slice(0, 300) || same.trip_date !== input.date))
      return JSON.stringify({ ok: false, reason: "This customer asked for several transfers: call quote_trip once with every leg (including the one already quoted).", handover: false });
  }
  return saveDraft(conversationId, channel, [leg], needs);
}

/** quote_trip: several transfers become one draft with per-leg lines, each priced by the existing pricing. */
export async function draftFromLegs(conversationId: string, channel: string, items: { input: QuoteInput; result: QuoteResult }[], needs: VehicleNeeds = NO_NEEDS): Promise<string> {
  if (!salesMediaOn() || !quoteApprovalRequired(channel)) return JSON.stringify({ ok: false, reason: "Multi-leg quotes are unavailable." });
  if (items.length < 2 || items.length > MAX_LEGS) return JSON.stringify({ ok: false, reason: `A trip quote takes 2 to ${MAX_LEGS} transfers; otherwise hand over to staff.`, handover: items.length > MAX_LEGS });
  const legs: LegDraft[] = [];
  for (const [i, item] of items.entries()) {
    const leg = legDraft(item.input, item.result, needs);
    // A leg that needs a question (date in the past, missing place) is asked about before anything is drafted.
    if (!leg) return JSON.stringify(item.result.ok ? { ok: false, reason: `No single car fits leg ${i + 1}; hand over to staff.`, handover: true } : { ...item.result, reason: `Leg ${i + 1}: ${item.result.reason}` });
    legs.push(leg);
  }
  return saveDraft(conversationId, channel, legs, needs);
}

/** One leg and the draft change together: the leg only while the draft is still at the revision shown, then the revision moves. */
async function changeLeg(d: Draft, legNo: number, set: string, values: unknown[], editor: string | null = null) {
  const stamp = nowIso();
  const results = await db().batch([
    db().prepare(`UPDATE ai_quote_legs SET ${set},crm_quote_id=NULL,crm_version=NULL WHERE draft_id=? AND leg_no=? AND EXISTS(SELECT 1 FROM ai_quote_drafts WHERE id=? AND status='pending' AND revision=?)`).bind(...values, d.id, legNo, d.id, d.revision),
    db().prepare(`UPDATE ai_quote_drafts SET price_thb=(SELECT CASE WHEN SUM(price_thb IS NULL)>0 THEN NULL ELSE SUM(price_thb) END FROM ai_quote_legs WHERE draft_id=ai_quote_drafts.id),crm_quote_id=NULL,edited_by=COALESCE(?,edited_by),revision=revision+1,updated_at=? WHERE id=? AND status='pending' AND revision=?`)
      .bind(editor, stamp, d.id, d.revision),
  ]);
  return results[1].meta.changes > 0;
}

/** The Telegram user, if they are the owner: linked to an active staff account with role owner (decision D13). */
export async function ownerActor(user: TelegramUser | undefined) {
  if (!user || user.is_bot) return null;
  return db().prepare("SELECT t.display_name name,s.id staff_id FROM telegram_admins t JOIN staff_accounts s ON s.id=t.staff_id WHERE t.telegram_user_id=? AND t.enabled=1 AND s.active=1 AND s.role='owner'")
    .bind(String(user.id)).first<{ name: string; staff_id: string }>();
}

export type CallbackAnswer = { text: string; alert?: boolean };

/** Buttons on a quote card ("sq_*" callbacks). Returns the toast for answerCallbackQuery. */
export async function handleQuoteCallback(data: string, from: TelegramUser, cardMessageId: number | null): Promise<CallbackAnswer> {
  const cb = parseQuoteCallback(data);
  if (!cb) return { text: "Unknown action." };
  const owner = await ownerActor(from);
  if (!owner) {
    await logActivity({ event: "security", status: "error", actor: `telegram:${from.id}`, summary: "A non-owner tapped a quote approval button; refused", detail: { action: cb.action } });
    return { text: "Only the owner can act on quote drafts.", alert: true };
  }
  const d = await draftById(cb.id);
  if (!d) return { text: "This draft no longer exists.", alert: true };
  const stamp = nowIso();
  // Only the tap that claims approval prepares links. A second tap must not rotate tokens while the first sends.
  if (cb.action === "ok" && d.status === "approving") return { text: "Approval is already in progress. Check the chat before sending again.", alert: true };
  if (cb.action === "ok" && d.status === "sending") return { text: "Send result unknown. Check the chat before sending again.", alert: true };
  if (d.status === "pending" && Date.parse(d.expires_at) <= Date.now()) {
    await db().prepare("UPDATE ai_quote_drafts SET status='expired',revision=revision+1,updated_at=? WHERE id=? AND status='pending'").bind(stamp, d.id).run();
    await refreshDraftCard(d.id);
    return { text: "This draft expired.", alert: true };
  }
  if (d.status !== "pending" || cb.revision !== d.revision) { await refreshDraftCard(d.id); return { text: d.status !== "pending" ? `This draft is already ${d.status.replace("_", " ")}.` : "This card changed. Use the updated buttons.", alert: true }; }

  if (cb.action === "legcar" || cb.action === "legedit") {
    const leg = (await legsFor(d.id)).find((l) => l.leg_no === cb.option);
    if (!leg) return { text: "That leg is not on this draft.", alert: true };
    if (cb.action === "legcar") {
      const list = options(leg);
      const next = list.map((_, k) => (leg.selected + 1 + k) % list.length).find((i) => list[i].price !== null);
      if (next === undefined) return { text: "No other priced car for this leg.", alert: true };
      const changed = await changeLeg(d, leg.leg_no, "selected=?,price_thb=?,table_price_thb=?,edited=0", [next, list[next].price, list[next].price]);
      await refreshDraftCard(d.id);
      return { text: changed ? `Leg ${leg.leg_no}: ${list[next].name}.` : "This card changed. Try again." };
    }
    const prompt = await tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), parse_mode: "HTML",
      text: `Reply to this message with the price in baht for leg ${leg.leg_no} (quote ${d.id}). Whole baht, e.g. 1800.`,
      reply_markup: { force_reply: true, selective: true }, ...(cardMessageId ? { reply_parameters: { message_id: cardMessageId, allow_sending_without_reply: true } } : {}) });
    await db().batch([
      db().prepare("INSERT OR REPLACE INTO ai_quote_prompts(telegram_message_id,draft_id,revision,telegram_user_id,created_at) VALUES(?,?,?,?,?)").bind(prompt.message_id, d.id, d.revision, String(from.id), stamp),
      db().prepare("INSERT OR REPLACE INTO ai_quote_leg_prompts(telegram_message_id,leg_no) VALUES(?,?)").bind(prompt.message_id, leg.leg_no),
    ]);
    return { text: `Reply with the price for leg ${leg.leg_no}.` };
  }

  if (cb.action === "car") {
    const o = cb.option === null ? undefined : options(d)[cb.option];
    if (!o || o.price === null) return { text: "That car has no price.", alert: true };
    const res = await db().prepare("UPDATE ai_quote_drafts SET selected=?,price_thb=?,table_price_thb=?,edited_by=NULL,crm_quote_id=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='pending' AND revision=?")
      .bind(cb.option, o.price, o.price, stamp, d.id, d.revision).run();
    await refreshDraftCard(d.id);
    return { text: res.meta.changes ? `${o.name} selected.` : "This card changed. Try again." };
  }
  if (cb.action === "edit") {
    const o = options(d)[d.selected];
    const prompt = await tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), parse_mode: "HTML",
      text: `Reply to this message with the price in baht for the ${o?.name ?? "car"} (quote ${d.id}). Whole baht, e.g. 1800.`,
      reply_markup: { force_reply: true, selective: true }, ...(cardMessageId ? { reply_parameters: { message_id: cardMessageId, allow_sending_without_reply: true } } : {}) });
    await db().prepare("INSERT OR REPLACE INTO ai_quote_prompts(telegram_message_id,draft_id,revision,telegram_user_id,created_at) VALUES(?,?,?,?,?)").bind(prompt.message_id, d.id, d.revision, String(from.id), stamp).run();
    return { text: "Reply with the new price." };
  }
  if (cb.action === "no" || cb.action === "take") {
    const status = cb.action === "no" ? "rejected" : "taken_over";
    const res = await db().prepare("UPDATE ai_quote_drafts SET status=?,decided_by=?,decided_at=?,revision=revision+1,updated_at=? WHERE id=? AND status='pending' AND revision=?")
      .bind(status, owner.name, stamp, stamp, d.id, d.revision).run();
    if (!res.meta.changes) return { text: "This card changed. Try again.", alert: true };
    if (cb.action === "take") await assign(d.conversation_id, { name: owner.name, staffId: owner.staff_id, telegramUserId: String(from.id) }, false);
    await logActivity({ event: cb.action === "no" ? "quote_rejected" : "mode_change", status: "ok", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: d.id,
      summary: cb.action === "no" ? `Quote draft ${d.id} rejected` : `Owner took over the chat from quote draft ${d.id}; the assistant stops replying` });
    await refreshDraftCard(d.id);
    return { text: cb.action === "no" ? "Rejected. Reply to the customer yourself." : "The chat is yours; the assistant is quiet." };
  }
  // Approve & send.
  const c = await conversation(d.conversation_id);
  const visitorSeq = await latestVisitorSeq(d.conversation_id);
  const blocker = approvalBlocker(d, cb.revision, { now: Date.now(), conversation: c, latestVisitorSeq: visitorSeq, ownerStaffId: owner.staff_id });
  if (blocker) return { text: blocker, alert: true };
  const claimed = await db().prepare("UPDATE ai_quote_drafts SET status='approving',decided_by=?,decided_at=?,updated_at=? WHERE id=? AND status='pending' AND revision=?")
    .bind(owner.name, stamp, stamp, d.id, d.revision).run();
  if (!claimed.meta.changes) return { text: "This draft was already handled.", alert: true };
  await refreshDraftCard(d.id);
  return finishApproval(d.id, owner, visitorSeq);
}

const bangkokTime = (iso: string, locale: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-ca-gregory" : locale === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Approved: CRM quote (once), then a single customer message. Never sends twice; an interrupted send is reported, not retried. */
async function finishApproval(id: string, owner: { name: string; staff_id: string }, visitorSeq: number): Promise<CallbackAnswer> {
  let d = (await draftById(id))!, url = "";
  let legs = await legsFor(id);
  const links: string[] = [];
  const issued: { quoteId: string; version: number; tokenHash: string }[] = [];
  const share = async (quoteId: string, version: number) => {
    const { url: link } = await crmAction("quote_share", { id: quoteId, expectedVersion: version }, owner.staff_id, "owner") as { url: string };
    issued.push({ quoteId, version, tokenHash: await sha256(link.slice(link.lastIndexOf("/") + 1)) });
    return link;
  };
  const stamp = nowIso();
  try {
    if (legs.length) {
      const contactId = await chatContact(d.conversation_id);
      if (!contactId) throw new Error("No CRM contact for this chat.");
      const lead = await db().prepare("SELECT id FROM crm_leads WHERE id=? AND contact_id=? AND stage NOT IN ('won','lost','cancelled')").bind(`chat:${d.conversation_id}`, contactId).first<{ id: string }>();
      let earliest = Date.now() + QUOTE_VALID_MS;
      for (const leg of legs) {
        const expires = new Date(Math.min(Date.now() + QUOTE_VALID_MS, Date.parse(`${leg.trip_date}T${leg.trip_time}:00+07:00`))).toISOString();
        earliest = Math.min(earliest, Date.parse(expires));
        if (leg.crm_quote_id) continue;
        const made = await crmAction("quote", { contactId, leadId: lead?.id ?? null, title: `Transfer quote leg ${leg.leg_no} of ${legs.length} (assistant draft ${d.id})`, pickup: leg.pickup, dropoff: leg.dropoff,
          tripDate: leg.trip_date, tripTime: leg.trip_time, vehicle: options(leg)[leg.selected].vehicle, amountMinor: leg.price_thb! * 100, expiresAt: expires }, owner.staff_id, "owner") as { id: string };
        // The version recorded here is what acceptance checks: a later staff edit of any leg invalidates them all.
        await db().prepare("UPDATE ai_quote_legs SET crm_quote_id=?,crm_version=1 WHERE draft_id=? AND leg_no=? AND crm_quote_id IS NULL").bind(made.id, id, leg.leg_no).run();
      }
      legs = await legsFor(id);
      await db().prepare("UPDATE ai_quote_drafts SET crm_quote_id=?,quote_expires_at=?,updated_at=? WHERE id=?").bind(legs[0].crm_quote_id, new Date(earliest).toISOString(), stamp, id).run();
      d = (await draftById(id))!;
    } else if (!d.crm_quote_id) {
      const contactId = await chatContact(d.conversation_id);
      if (!contactId) throw new Error("No CRM contact for this chat.");
      const lead = await db().prepare("SELECT id FROM crm_leads WHERE id=? AND contact_id=? AND stage NOT IN ('won','lost','cancelled')").bind(`chat:${d.conversation_id}`, contactId).first<{ id: string }>();
      const pickupAt = Date.parse(`${d.trip_date}T${d.trip_time}:00+07:00`);
      const expires = new Date(Math.min(Date.now() + QUOTE_VALID_MS, pickupAt)).toISOString();
      const o = options(d)[d.selected];
      const made = await crmAction("quote", { contactId, leadId: lead?.id ?? null, title: `Transfer quote (assistant draft ${d.id})`, pickup: d.pickup, dropoff: d.dropoff, tripDate: d.trip_date, tripTime: d.trip_time,
        vehicle: o.vehicle, amountMinor: d.price_thb! * 100, expiresAt: expires }, owner.staff_id, "owner") as { id: string };
      await db().prepare("UPDATE ai_quote_drafts SET crm_quote_id=?,quote_expires_at=?,updated_at=? WHERE id=? AND crm_quote_id IS NULL").bind(made.id, expires, stamp, id).run();
      d = (await draftById(id))!;
    }
    // A new link each try: nothing has been sent yet, so an older link was never seen by the customer.
    if (legs.length) for (const leg of legs) links.push(await share(leg.crm_quote_id!, leg.crm_version!));
    else url = await share(d.crm_quote_id!, 1);
    // From here a message may reach the customer: mark it first, so a crash is reported instead of resent.
    const moved = await db().prepare(`UPDATE ai_quote_drafts SET status='sending',updated_at=? WHERE id=? AND status='approving' AND revision=?
      AND EXISTS(SELECT 1 FROM website_conversations c WHERE c.id=ai_quote_drafts.conversation_id AND c.status<>'closed'
        AND (c.assigned_name IS NULL OR c.assigned_staff_id=?))
      AND ?=(SELECT COALESCE(MAX(rowid),0) FROM website_chat_messages WHERE conversation_id=ai_quote_drafts.conversation_id AND sender='visitor')`)
      .bind(stamp, id, d.revision, owner.staff_id, visitorSeq).run();
    if (!moved.meta.changes) throw new Error("The chat or quote changed while approval was being prepared.");
  } catch (error) {
    // Nothing was sent: the owner can try again from a fresh card.
    await db().prepare("UPDATE ai_quote_drafts SET status='pending',revision=revision+1,decided_by=NULL,decided_at=NULL,updated_at=? WHERE id=? AND status='approving'").bind(nowIso(), id).run();
    await refreshDraftCard(id);
    const reason = error instanceof Error ? error.message : "unknown error";
    await logActivity({ event: "quote_approved", status: "error", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: id, summary: `Quote ${id} not sent: ${reason}` });
    return { text: `Not sent: ${reason.slice(0, 150)}`, alert: true };
  }
  const last = await db().prepare("SELECT body FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' ORDER BY rowid DESC LIMIT 1").bind(d.conversation_id).first<{ body: string }>();
  const locale = customerLocale(last?.body), o = options(d)[d.selected] ?? options(legs[0])[legs[0].selected];
  const messages = getMessages(locale);
  const seats = await db().prepare("SELECT child_seats FROM ai_quote_needs WHERE draft_id=?").bind(id).first<{ child_seats: number }>();
  const carName = (v: { vehicle: string; name: string }) => VEHICLES[v.vehicle as VehicleId]?.name ?? v.name;
  const body = legs.length
    ? translate(messages, "salesQuote.multiMessage", { total: d.price_thb!.toLocaleString("en-US"), validUntil: bangkokTime(d.quote_expires_at!, locale),
      legs: legs.map((leg, i) => translate(messages, "salesQuote.leg", { number: leg.leg_no, route: `${leg.pickup.slice(0, 150)} → ${leg.dropoff.slice(0, 150)}`, date: leg.trip_date, time: leg.trip_time, passengers: leg.passengers, bags: leg.bags,
        car: carName(options(leg)[leg.selected]), price: leg.price_thb!.toLocaleString("en-US"), url: links[i] })).join("\n\n") })
    : translate(messages, "salesQuote.message", {
      route: `${d.pickup} → ${d.dropoff}`, date: d.trip_date, time: d.trip_time, passengers: d.passengers, bags: d.bags,
      car: carName(o), price: d.price_thb!.toLocaleString("en-US"), validUntil: bangkokTime(d.quote_expires_at!, locale), url,
    });
  const text = seats?.child_seats ? `${body}\n\n${translate(messages, "salesQuote.childSeats", { count: seats.child_seats, price: CHILD_SEAT_THB.toLocaleString("en-US") })}` : body;
  const messageId = await addBotMessage(d.conversation_id, text, null, { approvedQuote: { id, revision: d.revision, staffId: owner.staff_id, visitorSeq, issued } });
  const delivery = messageId ? await db().prepare("SELECT channel_message_id FROM website_chat_messages WHERE id=?").bind(messageId).first<{ channel_message_id: string | null }>() : null;
  const failed = !messageId ? "The quote or chat changed before sending." : delivery?.channel_message_id === "outside_window" ? "More than 24 hours since the customer's last WhatsApp message." : delivery?.channel_message_id === "failed" ? "The channel rejected the message." : null;
  await db().prepare("UPDATE ai_quote_drafts SET status=?,note=?,revision=revision+1,updated_at=? WHERE id=? AND status='sending'").bind(failed ? "undelivered" : "sent", failed, nowIso(), id).run();
  await logActivity({ event: failed ? "send_failed" : "quote_sent", status: failed ? "error" : "ok", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: id,
    summary: failed ? `Quote ${id} approved but not delivered: ${failed}` : `Quote ${id} approved and sent: ${legs.length ? `${legs.length} legs, total` : o.name} ฿${d.price_thb!.toLocaleString("en-US")}${d.edited_by ? " (price edited by owner)" : ""}, valid 3 hours`,
    detail: { draft: id, crmQuote: d.crm_quote_id, vehicle: o.vehicle, priceThb: d.price_thb, tablePriceThb: d.table_price_thb, source: d.price_source, edited: Boolean(d.edited_by) } });
  await refreshDraftCard(id);
  return failed ? { text: `Approved, but not delivered: ${failed}`, alert: true } : { text: "Sent to the customer." };
}

/** The chat's CRM contact (created by the chat trigger), following merges. */
async function chatContact(conversationId: string) {
  let id = (await db().prepare("SELECT contact_id FROM crm_sources WHERE kind='chat' AND source_id=?").bind(conversationId).first<{ contact_id: string }>())?.contact_id ?? null;
  for (let i = 0; id && i < 5; i++) {
    const c = await db().prepare("SELECT id,merged_into FROM crm_contacts WHERE id=?").bind(id).first<{ id: string; merged_into: string | null }>();
    if (!c) return null;
    if (!c.merged_into) return c.id;
    id = c.merged_into;
  }
  return null;
}

/** The owner's reply to an "Edit price" prompt. Returns true when the message was such a reply (handled either way). */
export async function handleQuotePriceReply(m: TelegramMessage): Promise<boolean> {
  if (!m.reply_to_message || String(m.chat.id) !== telegramChatId()) return false;
  await ensureQuoteTables();
  const prompt = await db().prepare("SELECT * FROM ai_quote_prompts WHERE telegram_message_id=?").bind(m.reply_to_message.message_id).first<{ draft_id: string; revision: number; telegram_user_id: string; created_at: string }>();
  if (!prompt) return false;
  const owner = await ownerActor(m.from);
  if (!owner) { await sendCard("Only the owner can set quote prices.", undefined, m.message_id).catch(() => undefined); return true; }
  // Revision 0 marks a prompt that was already used: each prompt sets one price.
  if (prompt.revision === 0) { await sendCard("This price prompt was already used. Tap Edit price again to change it.", undefined, m.message_id).catch(() => undefined); return true; }
  if (Date.parse(prompt.created_at) < Date.now() - 30 * 60 * 1000) { await sendCard("This price prompt expired. Tap Edit price again.", undefined, m.message_id).catch(() => undefined); return true; }
  const price = parsePriceReply(m.text);
  if (price === null) { await sendCard("Send a whole number of baht between 100 and 1,000,000, e.g. 1800.", undefined, m.message_id).catch(() => undefined); return true; }
  const stamp = nowIso();
  const leg = await db().prepare("SELECT leg_no FROM ai_quote_leg_prompts WHERE telegram_message_id=?").bind(m.reply_to_message.message_id).first<{ leg_no: number }>();
  const current = await draftById(prompt.draft_id);
  const changed = leg
    ? Boolean(current && current.revision === prompt.revision && await changeLeg(current, leg.leg_no, "price_thb=?,edited=1", [price], owner.name))
    : (await db().prepare("UPDATE ai_quote_drafts SET price_thb=?,edited_by=?,crm_quote_id=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='pending' AND revision=?").bind(price, owner.name, stamp, prompt.draft_id, prompt.revision).run()).meta.changes > 0;
  await db().prepare("UPDATE ai_quote_prompts SET revision=0 WHERE telegram_message_id=?").bind(m.reply_to_message.message_id).run();
  if (!changed) { await sendCard("This draft changed. Tap Edit price on the updated card.", undefined, m.message_id).catch(() => undefined); return true; }
  const d = (await draftById(prompt.draft_id))!;
  await logActivity({ event: "quote_price_edited", status: "ok", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: d.id,
    summary: `Owner set the price of quote draft ${d.id}${leg ? ` leg ${leg.leg_no}` : ""} to ฿${price.toLocaleString("en-US")}${!leg && d.table_price_thb !== null ? ` (table ฿${d.table_price_thb.toLocaleString("en-US")})` : ""}`, detail: { priceThb: price, tablePriceThb: d.table_price_thb } });
  await refreshDraftCard(d.id);
  return true;
}

/** Hourly: used or old price prompts after a day; drafts (trip details) after the activity-log retention period. */
export async function purgeQuoteDrafts(at = new Date()) {
  await ensureQuoteTables();
  await db().batch([
    db().prepare("DELETE FROM ai_quote_prompts WHERE created_at<?").bind(new Date(at.getTime() - 86400000).toISOString()),
    db().prepare("DELETE FROM ai_quote_drafts WHERE updated_at<? AND status NOT IN ('approving','sending')").bind(new Date(at.getTime() - activityRetentionDays() * 86400000).toISOString()),
    db().prepare("DELETE FROM ai_quote_legs WHERE draft_id NOT IN (SELECT id FROM ai_quote_drafts)"),
    db().prepare("DELETE FROM ai_quote_needs WHERE draft_id NOT IN (SELECT id FROM ai_quote_drafts)"),
    db().prepare("DELETE FROM ai_quote_leg_prompts WHERE telegram_message_id NOT IN (SELECT telegram_message_id FROM ai_quote_prompts)"),
  ]);
}

/**
 * Partial acceptance of a multi-leg quote: a leg can be accepted only while the whole quote it was sent in is
 * still current. SQL for the accepting UPDATE, so a change between the check and the write is caught too.
 */
export const LEG_ACCEPT_GUARD = `NOT EXISTS(SELECT 1 FROM ai_quote_legs mine JOIN ai_quote_drafts owner ON owner.id=mine.draft_id WHERE mine.crm_quote_id=crm_quotes.id AND (
  owner.status NOT IN ('sending','sent','undelivered')
  OR EXISTS(SELECT 1 FROM ai_quote_legs sibling LEFT JOIN crm_quotes q ON q.id=sibling.crm_quote_id WHERE sibling.draft_id=mine.draft_id AND (q.id IS NULL OR q.version<>sibling.crm_version))))`;

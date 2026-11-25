import { env } from "cloudflare:workers";
import { crmAction } from "@/lib/crm";
import { getMessages, translate, type MessageKey } from "@/lib/i18n";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
import { recommendVehicles } from "@/lib/vehicle-recommendation";
import { addBotMessage, assign } from "@/lib/website-chat";
import { editCard, sendCard, telegramChatId, telegramConfigured, tg, type TelegramMessage, type TelegramUser } from "@/lib/telegram/client";
import { activityRetentionDays, logActivity } from "./activity-log";
import { rescore } from "./leads";
import { scheduleFollowups } from "./followups";
import { reminderOffered } from "./reminders";
import {
  QUOTE_VALID_MS, DRAFT_REVIEW_MS, MAX_LEGS, approvalBlocker, approvalChannels, baht, bundleTotal, customerLocale, draftCard, draftKeyboard, options,
  parsePriceReply, parseQuoteCallback, specialNeeds, type Draft, type DraftOption,
} from "./quote-rules";

// AI quote drafts (Sales Intelligence PR 2 + PR 4). On channels listed in SALES_AI_QUOTE_APPROVAL, the assistant's
// transfer prices are not shown to the customer: they become a draft that the owner approves in Telegram.
// All transfers quoted in one assistant reply form one bundle (one card, one approval, one customer message);
// each leg gets its own CRM quote and link, so the customer can accept legs separately. Only the owner may act.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
const nowIso = () => new Date().toISOString();

// Same statements as drizzle/0128_ai_quote_drafts.sql and 0129_ai_quote_bundles.sql (Workers Builds does not apply D1 migrations).
export const QUOTE_TABLES = [
  `CREATE TABLE IF NOT EXISTS ai_quote_drafts(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approving','sending','sent','undelivered','rejected','superseded','taken_over','expired')),revision INTEGER NOT NULL DEFAULT 1,pickup TEXT NOT NULL,dropoff TEXT NOT NULL,trip_date TEXT NOT NULL,trip_time TEXT NOT NULL,passengers INTEGER NOT NULL,bags INTEGER NOT NULL,summary TEXT NOT NULL,price_source TEXT NOT NULL CHECK(price_source IN ('price_table','manual')),options_json TEXT NOT NULL,selected INTEGER NOT NULL DEFAULT 0,price_thb INTEGER,table_price_thb INTEGER,edited_by TEXT,visitor_seq INTEGER NOT NULL,telegram_message_id INTEGER,crm_quote_id TEXT,note TEXT,quote_expires_at TEXT,decided_by TEXT,decided_at TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_quote_drafts_conversation ON ai_quote_drafts(conversation_id,status)`,
  `CREATE TABLE IF NOT EXISTS ai_quote_prompts(telegram_message_id INTEGER PRIMARY KEY,draft_id TEXT NOT NULL,revision INTEGER NOT NULL,telegram_user_id TEXT NOT NULL,created_at TEXT NOT NULL)`,
];
// PR 4 columns. SQLite has no "ADD COLUMN IF NOT EXISTS": an existing column is the expected error.
const BUNDLE_COLUMNS = ["ALTER TABLE ai_quote_drafts ADD COLUMN bundle_id TEXT", "ALTER TABLE ai_quote_drafts ADD COLUMN leg_no INTEGER NOT NULL DEFAULT 1", "ALTER TABLE ai_quote_drafts ADD COLUMN needs TEXT"];
let ready: Promise<unknown> | null = null;
export function ensureQuoteTables() {
  ready ??= (async () => {
    await db().batch(QUOTE_TABLES.map((sql) => db().prepare(sql)));
    for (const sql of BUNDLE_COLUMNS) await db().prepare(sql).run().catch((e: unknown) => { if (!/duplicate column/i.test(e instanceof Error ? e.message : "")) throw e; });
    await db().batch([
      db().prepare("CREATE INDEX IF NOT EXISTS ai_quote_drafts_bundle ON ai_quote_drafts(bundle_id,leg_no)"),
      // Drafts saved before bundles existed are one-leg bundles of themselves.
      db().prepare("UPDATE ai_quote_drafts SET bundle_id=id WHERE bundle_id IS NULL"),
    ]);
  })().catch((error) => { ready = null; throw error; });
  return ready;
}

export const quoteApprovalRequired = (channel: string | null | undefined) => approvalChannels(vars().SALES_AI_QUOTE_APPROVAL).has(channel ?? "web");

const PENDING_REPLY = JSON.stringify({ ok: true, pending_approval: true,
  instruction: "A Waydidi team member is confirming the price. In one short line in the customer's language, say the confirmed price will be sent in this chat shortly. If the customer asked for several trips, quote each of them in this same reply. Do not mention, estimate or compare any price, and do not call handover." });

export type QuoteInput = { pickup: string; dropoff: string; date: string; time: string; passengers: number; bags: number; special?: string };
type QuoteResult = { ok: true; kind: string; summary: string; cars: { vehicle: string; name: string; price: number }[]; notes: string[] } | { ok: false; reason: string; handover: boolean };
/** One assistant reply: the first quote opens a bundle, later quotes in the same reply join it. */
export type BundleRef = { id?: string };

const latestVisitorSeq = async (conversationId: string) =>
  (await db().prepare("SELECT COALESCE(MAX(rowid),0) seq FROM website_chat_messages WHERE conversation_id=? AND sender='visitor'").bind(conversationId).first<{ seq: number }>())?.seq ?? 0;
const conversation = (id: string) => db().prepare("SELECT id,public_id,status,assigned_staff_id,assigned_name,bot_thinking_at,telegram_message_id FROM website_conversations WHERE id=?").bind(id)
  .first<{ id: string; public_id: string | null; status: string; assigned_staff_id: string | null; assigned_name: string | null; bot_thinking_at: string | null; telegram_message_id: number | null }>();
export const draftById = async (id: string) => { await ensureQuoteTables(); return db().prepare("SELECT * FROM ai_quote_drafts WHERE id=?").bind(id).first<Draft>(); };
/** Every leg of a bundle, in order. Bundle-wide fields are read from the first. */
export const bundleLegs = async (bundleId: string) => { await ensureQuoteTables(); return (await db().prepare("SELECT * FROM ai_quote_drafts WHERE bundle_id=? ORDER BY leg_no").bind(bundleId).all<Draft>()).results; };

async function refreshCard(bundleId: string) {
  const legs = await bundleLegs(bundleId), d = legs[0];
  if (!d?.telegram_message_id || !telegramConfigured()) return;
  const c = await conversation(d.conversation_id);
  await editCard(d.telegram_message_id, draftCard(legs, c?.public_id ?? null, await latestVisitorSeq(d.conversation_id)), draftKeyboard(legs)).catch(() => undefined);
}
const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Called by the assistant's quote_transfer tool on an approval channel. Saves the server's prices as a draft leg,
 * posts or updates the owner's card and returns what the assistant may tell the customer (never a price).
 * Unpriceable routes that a single car can serve become a "needs your price" leg.
 */
export async function draftFromQuote(conversationId: string, channel: string, input: QuoteInput, result: QuoteResult, bundle: BundleRef = {}): Promise<string> {
  let opts: DraftOption[], source: Draft["price_source"], summary: string;
  if (result.ok) {
    opts = result.cars.slice(0, 4).map((c) => ({ vehicle: c.vehicle, name: c.name, price: c.price }));
    source = "price_table"; summary = result.summary;
  } else {
    const best = input.passengers <= 10 && result.handover ? recommendVehicles(input.passengers, input.bags, "").best : null;
    if (!best) return JSON.stringify(result);
    opts = [{ vehicle: best, name: VEHICLES[best].name, price: null }];
    source = "manual"; summary = `${input.pickup} → ${input.dropoff}, ${input.date} at ${input.time}`;
  }
  if (!telegramConfigured()) return JSON.stringify({ ok: false, reason: "Prices need the team's approval and the team channel is not connected; hand over to staff.", handover: true });
  await ensureQuoteTables();
  const now = new Date(), stamp = now.toISOString(), needs = specialNeeds(input.special).note;
  const leader = bundle.id ? (await bundleLegs(bundle.id))[0] : null;
  if (leader && leader.status === "pending") {
    // Another trip in the same reply: join the bundle (one card, one approval).
    const legs = await bundleLegs(leader.bundle_id);
    if (legs.length >= MAX_LEGS) return JSON.stringify({ ok: false, reason: `More than ${MAX_LEGS} trips at once; hand over to staff.`, handover: true });
    const id = newId(), legNo = legs.length + 1;
    // Guarded on the bundle still pending at its revision; the whole bundle moves to the next revision.
    const [added] = await db().batch([
      db().prepare(`INSERT INTO ai_quote_drafts(id,bundle_id,leg_no,conversation_id,channel,status,revision,pickup,dropoff,trip_date,trip_time,passengers,bags,needs,summary,price_source,options_json,selected,price_thb,table_price_thb,visitor_seq,expires_at,created_at,updated_at)
        SELECT ?,?,?,?,?,'pending',revision,?,?,?,?,?,?,?,?,?,?,0,?,?,visitor_seq,expires_at,?,? FROM ai_quote_drafts WHERE id=? AND status='pending' AND revision=?`).bind(id, leader.bundle_id, legNo, conversationId, channel,
        input.pickup.slice(0, 300), input.dropoff.slice(0, 300), input.date, input.time, input.passengers, input.bags, needs, summary.slice(0, 500), source, JSON.stringify(opts), opts[0].price, opts[0].price, stamp, stamp, leader.bundle_id, leader.revision),
      db().prepare("UPDATE ai_quote_drafts SET revision=revision+1,updated_at=? WHERE bundle_id=? AND status='pending' AND EXISTS(SELECT 1 FROM ai_quote_drafts WHERE id=?)").bind(stamp, leader.bundle_id, id),
    ]);
    if (!added.meta.changes) return JSON.stringify({ ok: false, reason: "The earlier price in this reply was already handled; hand over to staff.", handover: true });
    await refreshCard(leader.bundle_id);
    await rescore(conversationId).catch(() => undefined);
    await logActivity({ event: "quote_drafted", status: "ok", actor: "assistant", channel, conversationId, correlationId: leader.bundle_id,
      summary: `Trip ${legNo} added to quote draft ${leader.bundle_id} (${source === "manual" ? "needs a price" : `${opts.length} car option(s) from price tables`})`,
      detail: { draft: leader.bundle_id, leg: legNo, source, options: opts.map((o) => ({ vehicle: o.vehicle, price: o.price })) } });
    return PENDING_REPLY;
  }
  const id = newId(), seq = await latestVisitorSeq(conversationId);
  const older = (await db().prepare("SELECT DISTINCT bundle_id FROM ai_quote_drafts WHERE conversation_id=? AND status='pending'").bind(conversationId).all<{ bundle_id: string }>()).results;
  await db().batch([
    db().prepare("UPDATE ai_quote_drafts SET status='superseded',revision=revision+1,updated_at=? WHERE conversation_id=? AND status='pending'").bind(stamp, conversationId),
    db().prepare(`INSERT INTO ai_quote_drafts(id,bundle_id,leg_no,conversation_id,channel,status,pickup,dropoff,trip_date,trip_time,passengers,bags,needs,summary,price_source,options_json,selected,price_thb,table_price_thb,visitor_seq,expires_at,created_at,updated_at)
      VALUES(?,?,1,?,?,'pending',?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`).bind(id, id, conversationId, channel, input.pickup.slice(0, 300), input.dropoff.slice(0, 300), input.date, input.time, input.passengers, input.bags,
      needs, summary.slice(0, 500), source, JSON.stringify(opts), opts[0].price, opts[0].price, seq, new Date(now.getTime() + DRAFT_REVIEW_MS).toISOString(), stamp, stamp),
  ]);
  bundle.id = id;
  for (const o of older) await refreshCard(o.bundle_id);
  const legs = await bundleLegs(id), c = await conversation(conversationId);
  try {
    const sent = await sendCard(draftCard(legs, c?.public_id ?? null, seq), draftKeyboard(legs), c?.telegram_message_id ?? undefined) as TelegramMessage;
    await db().prepare("UPDATE ai_quote_drafts SET telegram_message_id=? WHERE bundle_id=?").bind(sent.message_id, id).run();
  } catch (error) {
    // Without a card nobody can approve: the draft is withdrawn and the chat goes to staff.
    await db().prepare("UPDATE ai_quote_drafts SET status='expired',updated_at=? WHERE bundle_id=?").bind(nowIso(), id).run();
    bundle.id = undefined;
    console.error("quote draft card failed", error instanceof Error ? error.message : "unknown");
    return JSON.stringify({ ok: false, reason: "The team could not be reached to confirm the price; hand over to staff.", handover: true });
  }
  await logActivity({ event: "quote_drafted", status: "ok", actor: "assistant", channel, conversationId, correlationId: id,
    summary: `Quote draft ${id} for owner approval (${source === "manual" ? "needs a price" : `${opts.length} car option(s) from price tables`})${needs ? "; customer has special requests" : ""}`,
    detail: { draft: id, leg: 1, source, options: opts.map((o) => ({ vehicle: o.vehicle, price: o.price })), specialRequests: Boolean(needs) } });
  await rescore(conversationId).catch(() => undefined);
  return PENDING_REPLY;
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
  const legs = await bundleLegs(cb.id), d = legs[0];
  if (!d) return { text: "This draft no longer exists.", alert: true };
  const stamp = nowIso();
  // A retried tap after an interrupted approval: finish what can be finished safely.
  if (cb.action === "ok" && (d.status === "approving" || d.status === "sending")) return d.status === "approving" && d.decided_by === owner.name ? finishApproval(d.bundle_id, owner) : { text: "Send result unknown. Check the chat before sending again.", alert: true };
  if (d.status === "pending" && Date.parse(d.expires_at) <= Date.now()) {
    await db().prepare("UPDATE ai_quote_drafts SET status='expired',revision=revision+1,updated_at=? WHERE bundle_id=? AND status='pending'").bind(stamp, d.bundle_id).run();
    await refreshCard(d.bundle_id);
    return { text: "This draft expired.", alert: true };
  }
  if (d.status !== "pending" || cb.revision !== d.revision) { await refreshCard(d.bundle_id); return { text: d.status !== "pending" ? `This draft is already ${d.status.replace("_", " ")}.` : "This card changed. Use the updated buttons.", alert: true }; }

  if (cb.action === "car") {
    if (legs.length > 1) return { text: "Change the price per trip instead.", alert: true };
    const o = cb.option === null ? undefined : options(d)[cb.option];
    if (!o || o.price === null) return { text: "That car has no price.", alert: true };
    const res = await db().prepare("UPDATE ai_quote_drafts SET selected=?,price_thb=?,table_price_thb=?,edited_by=NULL,revision=revision+1,updated_at=? WHERE bundle_id=? AND status='pending' AND revision=?")
      .bind(cb.option, o.price, o.price, stamp, d.bundle_id, d.revision).run();
    await refreshCard(d.bundle_id);
    return { text: res.meta.changes ? `${o.name} selected.` : "This card changed. Try again." };
  }
  if (cb.action === "edit") {
    const leg = legs[cb.option ?? 0];
    if (!leg) return { text: "That trip is not on this draft.", alert: true };
    const o = options(leg)[leg.selected];
    const prompt = await tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), parse_mode: "HTML",
      text: `Reply to this message with the price in baht for ${legs.length > 1 ? `trip ${leg.leg_no}, ` : ""}the ${o?.name ?? "car"} (quote ${d.bundle_id}). Whole baht, e.g. 1800.`,
      reply_markup: { force_reply: true, selective: true }, ...(cardMessageId ? { reply_parameters: { message_id: cardMessageId, allow_sending_without_reply: true } } : {}) });
    await db().prepare("INSERT OR REPLACE INTO ai_quote_prompts(telegram_message_id,draft_id,revision,telegram_user_id,created_at) VALUES(?,?,?,?,?)").bind(prompt.message_id, leg.id, d.revision, String(from.id), stamp).run();
    return { text: "Reply with the new price." };
  }
  if (cb.action === "no" || cb.action === "take") {
    const status = cb.action === "no" ? "rejected" : "taken_over";
    const res = await db().prepare("UPDATE ai_quote_drafts SET status=?,decided_by=?,decided_at=?,revision=revision+1,updated_at=? WHERE bundle_id=? AND status='pending' AND revision=?")
      .bind(status, owner.name, stamp, stamp, d.bundle_id, d.revision).run();
    if (!res.meta.changes) return { text: "This card changed. Try again.", alert: true };
    if (cb.action === "take") await assign(d.conversation_id, { name: owner.name, staffId: owner.staff_id, telegramUserId: String(from.id) }, false);
    await logActivity({ event: cb.action === "no" ? "quote_rejected" : "mode_change", status: "ok", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: d.bundle_id,
      summary: cb.action === "no" ? `Quote draft ${d.bundle_id} rejected` : `Owner took over the chat from quote draft ${d.bundle_id}; the assistant stops replying` });
    await refreshCard(d.bundle_id);
    return { text: cb.action === "no" ? "Rejected. Reply to the customer yourself." : "The chat is yours; the assistant is quiet." };
  }
  // Approve & send.
  const c = await conversation(d.conversation_id);
  const blocker = approvalBlocker(legs, cb.revision, { now: Date.now(), conversation: c, latestVisitorSeq: await latestVisitorSeq(d.conversation_id), ownerStaffId: owner.staff_id });
  if (blocker) return { text: blocker, alert: true };
  // One statement claims every leg at this revision, so two taps (or a tap and an edit) cannot both win.
  const claimed = await db().prepare("UPDATE ai_quote_drafts SET status='approving',decided_by=?,decided_at=?,updated_at=? WHERE bundle_id=? AND status='pending' AND revision=?")
    .bind(owner.name, stamp, stamp, d.bundle_id, d.revision).run();
  if (claimed.meta.changes !== legs.length) {
    if (claimed.meta.changes) await db().prepare("UPDATE ai_quote_drafts SET status='pending',decided_by=NULL,decided_at=NULL,revision=revision+1 WHERE bundle_id=? AND status='approving'").bind(d.bundle_id).run();
    return { text: "This draft was already handled.", alert: true };
  }
  await refreshCard(d.bundle_id);
  return finishApproval(d.bundle_id, owner);
}

const bangkokTime = (iso: string, locale: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-ca-gregory" : locale === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** The customer's message: the single-trip text, or one block per trip with its own link and the total. */
function customerMessage(legs: Draft[], urls: string[], locale: "en" | "th" | "zh", offerReminder = false) {
  const m = getMessages(locale), t = (k: MessageKey, v: Record<string, string | number>) => translate(m, k, v);
  const fields = (l: Draft) => { const o = options(l)[l.selected]; return { route: `${l.pickup} → ${l.dropoff}`, date: l.trip_date, time: l.trip_time, passengers: l.passengers, bags: l.bags, car: VEHICLES[o.vehicle as VehicleId]?.name ?? o.name, price: l.price_thb!.toLocaleString("en-US") }; };
  const validUntil = bangkokTime(legs[0].quote_expires_at!, locale);
  // WhatsApp with template reminders on: ask for consent to a 3-day reminder (only a YES queues it).
  const optIn = offerReminder ? `\n\n${t("salesQuote.reminderOptIn", {})}` : "";
  if (legs.length === 1) return t("salesQuote.message", { ...fields(legs[0]), validUntil, url: urls[0] }) + optIn;
  return [t("salesQuote.multiIntro", { count: legs.length }), ...legs.map((l, i) => t("salesQuote.multiLeg", { n: l.leg_no, ...fields(l), url: urls[i] })),
    t("salesQuote.multiTotal", { total: bundleTotal(legs)!.toLocaleString("en-US"), validUntil })].join("\n\n") + optIn;
}

/** Approved: one CRM quote per leg (once each), then a single customer message. Never sends twice; an interrupted send is reported, not retried. */
async function finishApproval(bundleId: string, owner: { name: string; staff_id: string }): Promise<CallbackAnswer> {
  let legs = await bundleLegs(bundleId);
  const d = legs[0], stamp = nowIso(), urls: string[] = [];
  try {
    const contactId = await chatContact(d.conversation_id);
    if (!contactId) throw new Error("No CRM contact for this chat.");
    const lead = await db().prepare("SELECT id FROM crm_leads WHERE id=? AND contact_id=? AND stage NOT IN ('won','lost','cancelled')").bind(`chat:${d.conversation_id}`, contactId).first<{ id: string }>();
    const validUntil = Date.now() + QUOTE_VALID_MS;
    for (const l of legs.filter((x) => !x.crm_quote_id)) {
      const pickupAt = Date.parse(`${l.trip_date}T${l.trip_time}:00+07:00`);
      const expires = new Date(Math.min(validUntil, pickupAt)).toISOString();
      const o = options(l)[l.selected];
      const made = await crmAction("quote", { contactId, leadId: lead?.id ?? null, title: `Transfer quote (assistant draft ${bundleId}${legs.length > 1 ? `, trip ${l.leg_no}` : ""})`, pickup: l.pickup, dropoff: l.dropoff, tripDate: l.trip_date, tripTime: l.trip_time,
        vehicle: o.vehicle, amountMinor: l.price_thb! * 100, expiresAt: expires }, owner.staff_id, "owner") as { id: string };
      await db().prepare("UPDATE ai_quote_drafts SET crm_quote_id=?,quote_expires_at=?,updated_at=? WHERE id=? AND crm_quote_id IS NULL").bind(made.id, expires, stamp, l.id).run();
    }
    legs = await bundleLegs(bundleId);
    // A new link each try: nothing has been sent yet, so an older link was never seen by the customer.
    for (const l of legs) urls.push((await crmAction("quote_share", { id: l.crm_quote_id }, owner.staff_id, "owner") as { url: string }).url);
    // From here a message may reach the customer: mark it first, so a crash is reported instead of resent.
    const moved = await db().prepare("UPDATE ai_quote_drafts SET status='sending',updated_at=? WHERE bundle_id=? AND status='approving'").bind(stamp, bundleId).run();
    if (!moved.meta.changes) return { text: "This draft was already handled.", alert: true };
  } catch (error) {
    // Nothing was sent: the owner can try again from a fresh card.
    await db().prepare("UPDATE ai_quote_drafts SET status='pending',revision=revision+1,decided_by=NULL,decided_at=NULL,updated_at=? WHERE bundle_id=? AND status='approving'").bind(nowIso(), bundleId).run();
    await refreshCard(bundleId);
    const reason = error instanceof Error ? error.message : "unknown error";
    await logActivity({ event: "quote_approved", status: "error", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: bundleId, summary: `Quote ${bundleId} not sent: ${reason}` });
    return { text: `Not sent: ${reason.slice(0, 150)}`, alert: true };
  }
  const last = await db().prepare("SELECT body FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' ORDER BY rowid DESC LIMIT 1").bind(d.conversation_id).first<{ body: string }>();
  // The quote's validity is the earliest leg's (a leg may end sooner because its pickup is sooner).
  const earliest = legs.map((l) => l.quote_expires_at!).sort()[0];
  const text = customerMessage(legs.map((l) => ({ ...l, quote_expires_at: earliest })), urls, customerLocale(last?.body), reminderOffered(d.channel));
  const messageId = await addBotMessage(d.conversation_id, text);
  const delivery = messageId ? await db().prepare("SELECT channel_message_id FROM website_chat_messages WHERE id=?").bind(messageId).first<{ channel_message_id: string | null }>() : null;
  const failed = !messageId ? "The message could not be saved." : delivery?.channel_message_id === "outside_window" ? "More than 24 hours since the customer's last WhatsApp message." : delivery?.channel_message_id === "failed" ? "The channel rejected the message." : null;
  await db().prepare("UPDATE ai_quote_drafts SET status=?,note=?,revision=revision+1,updated_at=? WHERE bundle_id=? AND status='sending'").bind(failed ? "undelivered" : "sent", failed, nowIso(), bundleId).run();
  const total = bundleTotal(legs)!;
  await logActivity({ event: failed ? "send_failed" : "quote_sent", status: failed ? "error" : "ok", actor: `owner:${owner.staff_id}`, channel: d.channel, conversationId: d.conversation_id, correlationId: bundleId,
    summary: failed ? `Quote ${bundleId} approved but not delivered: ${failed}` : `Quote ${bundleId} approved and sent: ${legs.length > 1 ? `${legs.length} trips, total ` : `${options(d)[d.selected]?.name} `}${baht(total)}${legs.some((l) => l.edited_by) ? " (price edited by owner)" : ""}, valid 3 hours`,
    detail: { draft: bundleId, priceThb: total, legs: legs.map((l) => ({ leg: l.leg_no, crmQuote: l.crm_quote_id, vehicle: options(l)[l.selected]?.vehicle, priceThb: l.price_thb, tablePriceThb: l.table_price_thb, source: l.price_source, edited: Boolean(l.edited_by) })) } });
  await refreshCard(bundleId);
  // Follow-ups (SALES_AI_FOLLOWUPS) and the 7-day review (SALES_AI_LEADS) only for quotes that reached the customer.
  if (!failed) await scheduleFollowups(bundleId, d.conversation_id).catch((e) => console.error("follow-up scheduling failed", e instanceof Error ? e.message : "unknown"));
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
  const leg = await draftById(prompt.draft_id);
  const stamp = nowIso();
  // One statement: the price lands on this leg and the whole bundle moves to the next revision, only if nothing changed since the prompt.
  const res = leg ? await db().prepare("UPDATE ai_quote_drafts SET price_thb=CASE WHEN id=? THEN ? ELSE price_thb END,edited_by=CASE WHEN id=? THEN ? ELSE edited_by END,revision=revision+1,updated_at=? WHERE bundle_id=? AND status='pending' AND revision=?")
    .bind(leg.id, price, leg.id, owner.name, stamp, leg.bundle_id, prompt.revision).run() : { meta: { changes: 0 } };
  await db().prepare("UPDATE ai_quote_prompts SET revision=0 WHERE telegram_message_id=?").bind(m.reply_to_message.message_id).run();
  if (!res.meta.changes || !leg) { await sendCard("This draft changed. Tap Edit price on the updated card.", undefined, m.message_id).catch(() => undefined); return true; }
  await logActivity({ event: "quote_price_edited", status: "ok", actor: `owner:${owner.staff_id}`, channel: leg.channel, conversationId: leg.conversation_id, correlationId: leg.bundle_id,
    summary: `Owner set the price of quote draft ${leg.bundle_id}${leg.leg_no > 1 || res.meta.changes > 1 ? ` trip ${leg.leg_no}` : ""} to ${baht(price)}${leg.table_price_thb !== null ? ` (table ${baht(leg.table_price_thb)})` : ""}`, detail: { leg: leg.leg_no, priceThb: price, tablePriceThb: leg.table_price_thb } });
  await refreshCard(leg.bundle_id);
  return true;
}

/** Hourly: used or old price prompts after a day; drafts (trip details) after the activity-log retention period. */
export async function purgeQuoteDrafts(at = new Date()) {
  await ensureQuoteTables();
  await db().batch([
    db().prepare("DELETE FROM ai_quote_prompts WHERE created_at<?").bind(new Date(at.getTime() - 86400000).toISOString()),
    db().prepare("DELETE FROM ai_quote_drafts WHERE updated_at<? AND status NOT IN ('approving','sending')").bind(new Date(at.getTime() - activityRetentionDays() * 86400000).toISOString()),
  ]);
}

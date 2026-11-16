import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { createManualBooking, manualBookingProblem, manualBookingSchema } from "@/lib/manual-booking";
import { publicSiteUrl } from "@/lib/site";
import { esc } from "@/lib/telegram/cards";
import { answerCallback, sendTo, telegramChatId, tg, type InlineKeyboard, type TelegramMessage } from "@/lib/telegram/client";
import { answerPdfCommand } from "@/lib/telegram/confirmation-pdf";
import { bangkokToday } from "@/lib/telegram/job-lookup-rules";
import {
  AI_SYSTEM_PROMPT, BOOK_HELP, MAX_BOOKING_TEXT, aiUserPrompt, bookingBuilderOn, draftProblem, draftSummary, draftToManualInput,
  isCancelWord, missingFields, parseAiFields, parseBookCommand, readFields, splitLabelled, type DraftFields,
} from "@/lib/telegram/booking-builder-rules";

// /book in the Admin Telegram group (Telegram team list only; off until TELEGRAM_BOOKING_BUILDER=1): staff type a new
// booking freely, the bot shows what it understood and what is missing, staff reply to the bot to add or fix fields,
// then "สร้างการจอง" saves it exactly like Admin → Manual booking (lib/manual-booking.ts) and the bot replies with the
// confirmation PDF. Nothing is ever sent to the customer from here: staff forward the PDF.
// Labelled lines ("name: John") are read by code; other text by Claude when ANTHROPIC_API_KEY is set. The AI's answer
// is untrusted data and goes through the same checks as typed values (readFields), and nothing is saved before a tap.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const vars = () => env as unknown as Record<string, string | undefined>;
export type ModelCall = (system: string, user: string) => Promise<string>;
export type BookDeps = { call?: ModelCall | null; today?: string; now?: () => Date };
type Draft = { id: string; chat_id: string; fields_json: string; version: number; status: string; booking_reference: string | null; updated_at: string };

const DRAFT_HOURS = 48;
// Claude Haiku 5.5 at low effort: reading fields from a short note is simple work. It thinks before it answers and that
// counts toward max_tokens, so the cap leaves room for both. A refusal or a cut-off answer is "could not read" (no fields).
const MODEL = "claude-haiku-5-5";
const callClaude: ModelCall = async (system, user) => {
  const client = new Anthropic({ apiKey: vars().ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 });
  const res = await client.messages.create({ model: MODEL, max_tokens: 2000, output_config: { effort: "low" }, system, messages: [{ role: "user", content: user }] });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`AI reader stopped: ${res.stop_reason}`);
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
};
const defaultCall = () => (vars().ANTHROPIC_API_KEY ? callClaude : null);

let ready: Promise<unknown> | null = null;
/** Tables are also in drizzle/0125_telegram_booking_drafts.sql; Workers Builds does not apply migrations, so they are made on first use. */
function ensureTables() {
  return (ready ??= (async () => {
    await db().prepare(`CREATE TABLE IF NOT EXISTS telegram_booking_drafts (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, request_message_id INTEGER NOT NULL,
      created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, fields_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft', booking_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).bind().run();
    await db().prepare("CREATE UNIQUE INDEX IF NOT EXISTS telegram_booking_drafts_request ON telegram_booking_drafts(chat_id, request_message_id)").bind().run();
    await db().prepare("CREATE TABLE IF NOT EXISTS telegram_booking_draft_messages (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, draft_id TEXT NOT NULL, PRIMARY KEY (chat_id, message_id))").bind().run();
  })().catch((e) => { ready = null; throw e; }));
}

const fieldsOf = (d: Draft): DraftFields => { try { return JSON.parse(d.fields_json) as DraftFields; } catch { return {}; } };
const fresh = (d: Draft, now: Date) => now.getTime() - Date.parse(d.updated_at) < DRAFT_HOURS * 3_600_000;

/** Reads staff text: labelled lines by code, the rest by the AI reader (when there is one). Problems are in Thai. */
async function readText(text: string, today: string, call: ModelCall | null): Promise<{ patch: DraftFields; problems: string[] }> {
  const { labelled, rest } = splitLabelled(text.slice(0, MAX_BOOKING_TEXT));
  let fromAi: Partial<Record<string, string>> = {};
  const problems: string[] = [];
  if (rest.trim()) {
    if (!call) problems.push(`อ่านไม่ได้ (ไม่มี AI): “${rest.slice(0, 80)}” พิมพ์เป็นบรรทัด เช่น name: John Smith`);
    else {
      const raw = await call(AI_SYSTEM_PROMPT, aiUserPrompt(rest, today)).catch(() => null);
      const parsed = raw === null ? null : parseAiFields(raw);
      if (parsed) fromAi = parsed;
      else problems.push("AI อ่านข้อความไม่ได้ตอนนี้ ลองอีกครั้ง หรือพิมพ์เป็นบรรทัด เช่น name: John Smith");
    }
  }
  // A labelled line wins over what the AI read from the other lines.
  const read = readFields({ ...fromAi, ...labelled }, today);
  return { patch: read.patch, problems: [...problems, ...read.problems] };
}

const keyboardFor = (d: { id: string; version: number }, f: DraftFields): InlineKeyboard =>
  !missingFields(f).length && !draftProblem(f)
    ? [[{ text: "✅ สร้างการจอง", callback_data: `bkb_ok:${d.id}:${d.version}` }, { text: "ยกเลิก", callback_data: `bkb_no:${d.id}:${d.version}` }]]
    : [[{ text: "ยกเลิก", callback_data: `bkb_no:${d.id}:${d.version}` }]];

/** Posts the summary as a reply and remembers the message, so a reply to it reaches this draft. */
async function postSummary(d: { id: string; chat_id: string; version: number }, f: DraftFields, problems: string[], replyTo: number) {
  const sent = await sendTo(d.chat_id, draftSummary(f, problems), keyboardFor(d, f), replyTo);
  if (sent?.message_id) await db().prepare("INSERT OR IGNORE INTO telegram_booking_draft_messages(chat_id,message_id,draft_id) VALUES(?,?,?)").bind(d.chat_id, sent.message_id, d.id).run();
}

/**
 * /book in the Admin group, or a reply to one of a draft's messages. Returns true when the message was handled.
 * `member` is the approved Telegram team member (null = not on the team).
 */
export async function handleBookingBuilder(m: TelegramMessage, member: { display_name: string } | null, deps: BookDeps = {}) {
  const text = (m.text ?? m.caption ?? "").trim(), chatId = String(m.chat.id);
  if (chatId !== telegramChatId() || !bookingBuilderOn(vars())) return false;
  const command = parseBookCommand(text);
  const repliedTo = m.reply_to_message?.message_id;
  if (command === null && !repliedTo) return false;
  await ensureTables();
  const now = deps.now?.() ?? new Date(), today = deps.today ?? bangkokToday(now.getTime());
  const call = deps.call === undefined ? defaultCall() : deps.call;
  const reply = (body: string) => sendTo(chatId, body, undefined, m.message_id).catch(() => undefined);

  if (command !== null) {
    if (!member) { await reply(`เฉพาะทีม Waydidi ใน Telegram เท่านั้นที่สร้างการจองได้ Telegram ID ของคุณคือ <code>${esc(m.from?.id ?? "unknown")}</code>`); return true; }
    if (!command) { await reply(BOOK_HELP); return true; }
    if (command.length > MAX_BOOKING_TEXT) { await reply(`ยาวเกินไป (ไม่เกิน ${MAX_BOOKING_TEXT.toLocaleString("en-US")} ตัวอักษร)`); return true; }
    // One draft per /book message: a webhook retry finds the same row and does nothing more.
    const id = crypto.randomUUID(), stamp = now.toISOString();
    const claimed = await db().prepare(`INSERT OR IGNORE INTO telegram_booking_drafts(id,chat_id,request_message_id,created_by,created_by_name,fields_json,version,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'{}',1,'draft',?,?)`).bind(id, chatId, m.message_id, String(m.from?.id ?? ""), member.display_name, stamp, stamp).run();
    if (!claimed.meta.changes) return true;
    const { patch, problems } = await readText(command, today, call);
    await db().prepare("UPDATE telegram_booking_drafts SET fields_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(patch), now.toISOString(), id).run();
    await postSummary({ id, chat_id: chatId, version: 1 }, patch, problems, m.message_id);
    return true;
  }

  // A reply: only to a message of a draft.
  const link = await db().prepare("SELECT draft_id FROM telegram_booking_draft_messages WHERE chat_id=? AND message_id=?").bind(chatId, repliedTo).first<{ draft_id: string }>();
  if (!link) return false;
  if (!member) { await reply(`เฉพาะทีม Waydidi ใน Telegram เท่านั้นที่แก้การจองได้ Telegram ID ของคุณคือ <code>${esc(m.from?.id ?? "unknown")}</code>`); return true; }
  const draft = await db().prepare("SELECT * FROM telegram_booking_drafts WHERE id=?").bind(link.draft_id).first<Draft>();
  if (!draft) return true;
  if (draft.status === "created") { await reply(`การจองนี้สร้างแล้ว: <b>${esc(draft.booking_reference)}</b> แก้ไขที่ Admin → Bookings`); return true; }
  if (draft.status !== "draft") { await reply("ร่างนี้ปิดแล้ว เริ่มใหม่ด้วย /book"); return true; }
  if (!fresh(draft, now)) { await reply(`ร่างนี้หมดอายุแล้ว (${DRAFT_HOURS} ชั่วโมง) เริ่มใหม่ด้วย /book`); return true; }
  if (isCancelWord(text)) {
    const done = await db().prepare("UPDATE telegram_booking_drafts SET status='cancelled',updated_at=? WHERE id=? AND status='draft'").bind(now.toISOString(), draft.id).run();
    await reply(done.meta.changes ? "ยกเลิกร่างการจองแล้ว" : "ร่างนี้ปิดแล้ว");
    return true;
  }
  if (!text) return true;
  if (text.length > MAX_BOOKING_TEXT) { await reply(`ยาวเกินไป (ไม่เกิน ${MAX_BOOKING_TEXT.toLocaleString("en-US")} ตัวอักษร)`); return true; }
  const { patch, problems } = await readText(text, today, call);
  // Two replies at once: each merges onto the version it read; a lost race reads again once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = attempt === 0 ? draft : await db().prepare("SELECT * FROM telegram_booking_drafts WHERE id=?").bind(draft.id).first<Draft>();
    if (!current || current.status !== "draft") { await reply("ร่างนี้ปิดแล้ว"); return true; }
    const merged = { ...fieldsOf(current), ...patch };
    const saved = await db().prepare("UPDATE telegram_booking_drafts SET fields_json=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='draft'")
      .bind(JSON.stringify(merged), now.toISOString(), current.id, current.version).run();
    if (saved.meta.changes) { await postSummary({ id: current.id, chat_id: chatId, version: current.version + 1 }, merged, problems, m.message_id); return true; }
  }
  await reply("มีคนแก้ร่างนี้พร้อมกัน ลองตอบกลับอีกครั้ง");
  return true;
}

/**
 * "สร้างการจอง" / "ยกเลิก" under a draft summary. The webhook has already checked the chat and that the tapper is on the
 * Telegram team. The button carries the version it was shown for: a button under an older summary does nothing.
 */
export async function handleBookingCallback(action: string, id: string, versionText: string, who: { name: string }, q: { id: string; message?: TelegramMessage }, deps: BookDeps = {}) {
  await ensureTables();
  const now = deps.now?.() ?? new Date(), version = Number(versionText);
  const draft = await db().prepare("SELECT * FROM telegram_booking_drafts WHERE id=?").bind(id).first<Draft>();
  if (!draft || draft.chat_id !== telegramChatId()) return answerCallback(q.id, "ไม่พบร่างนี้", true);
  if (draft.status === "created") return answerCallback(q.id, `สร้างแล้ว: ${draft.booking_reference}`, true);
  if (draft.status !== "draft") return answerCallback(q.id, "ร่างนี้ปิดแล้ว", true);
  if (!Number.isInteger(version) || version !== draft.version) return answerCallback(q.id, "ข้อมูลเปลี่ยนแล้ว ใช้ปุ่มใต้ข้อความล่าสุด", true);
  const markup = (text: string) => q.message ? tg("editMessageReplyMarkup", { chat_id: draft.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: `bkb_done:${id}:0` }]] } }).catch(() => undefined) : undefined;

  if (action === "bkb_no") {
    const done = await db().prepare("UPDATE telegram_booking_drafts SET status='cancelled',updated_at=? WHERE id=? AND status='draft' AND version=?").bind(now.toISOString(), id, version).run();
    if (done.meta.changes) await markup(`ยกเลิกแล้ว · ${who.name}`);
    return answerCallback(q.id, done.meta.changes ? "ยกเลิกแล้ว" : "ร่างนี้ปิดแล้ว");
  }
  if (action !== "bkb_ok") return answerCallback(q.id);
  if (!fresh(draft, now)) return answerCallback(q.id, `ร่างนี้หมดอายุแล้ว (${DRAFT_HOURS} ชั่วโมง) เริ่มใหม่ด้วย /book`, true);

  // Checked again as Admin → Manual booking checks it: the summary may be old, and a date may have passed since.
  const fields = fieldsOf(draft);
  const parsed = manualBookingSchema.safeParse(draftToManualInput(fields));
  const problem = missingFields(fields).length ? "ข้อมูลยังไม่ครบ" : draftProblem(fields) ?? (parsed.success ? manualBookingProblem(parsed.data) : `ตรวจ ${String(parsed.error.issues[0]?.path?.[0] ?? "ข้อมูล")}`);
  if (problem || !parsed.success) return answerCallback(q.id, `สร้างไม่ได้: ${problem ?? "ข้อมูลไม่ถูกต้อง"} ตอบกลับข้อความเพื่อแก้`, true);

  // Exactly once: two taps, two people or a webhook retry, only the one that moves draft → creating saves.
  const claim = await db().prepare("UPDATE telegram_booking_drafts SET status='creating',updated_at=? WHERE id=? AND status='draft' AND version=?").bind(now.toISOString(), id, version).run();
  if (!claim.meta.changes) return answerCallback(q.id, "กำลังสร้างหรือสร้างแล้ว", true);
  await answerCallback(q.id, "กำลังสร้างการจอง…");
  let reference: string;
  try {
    reference = (await createManualBooking(parsed.data, publicSiteUrl(vars().WAYDIDI_PUBLIC_URL))).reference;
  } catch (error) {
    console.error("telegram booking builder: save failed", error instanceof Error ? error.message : "unknown");
    // Not put back to draft: the booking may have been saved before the error. Staff check first, then /book again.
    await db().prepare("UPDATE telegram_booking_drafts SET status='failed',updated_at=? WHERE id=? AND status='creating'").bind(new Date().toISOString(), id).run();
    await markup("⚠️ สร้างไม่สำเร็จ");
    if (q.message) await sendTo(draft.chat_id, "⚠️ สร้างการจองไม่สำเร็จ ตรวจที่ Admin → Bookings ก่อนว่ามีการจองนี้หรือยัง แล้วค่อย /book ใหม่", undefined, q.message.message_id).catch(() => undefined);
    return;
  }
  await db().prepare("UPDATE telegram_booking_drafts SET status='created',booking_reference=?,updated_at=? WHERE id=?").bind(reference, new Date().toISOString(), id).run();
  await markup(`✅ สร้างแล้ว ${reference} · ${who.name}`);
  // The confirmation PDF as a reply under the summary (the booking card itself is posted by createManualBooking).
  if (q.message) await answerPdfCommand(reference, q.message.message_id, null, null).catch((error) => console.error("telegram booking builder: pdf failed", error instanceof Error ? error.message : "unknown"));
}

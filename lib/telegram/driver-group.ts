import { env } from "cloudflare:workers";
import { prepareDriverImage } from "@/lib/admin-driver-images";
import { putFile } from "@/lib/file-store";
import { assignedDriverUrl } from "@/lib/trip-links";
import { esc } from "./cards";
import { answerCallback, downloadFile, editIn, sendPrivate, sendTo, telegramBotUsername, telegramChatId, tg, type InlineKeyboard, type TelegramMessage, type TelegramUser } from "./client";
import { jobVehicleName } from "./job-text";
import {
  CAR_TYPES, HOLD_MINUTES, STEP_QUESTION, checkTextAnswer, driverGroupConfig, isCarType, isGroupMember, isMyJobsCommand, jobStartLink, nextStep, offerText, parseJobStart,
  type DriverDraft, type FormStep, type OfferJob, type OfferState,
} from "./driver-group-rules";

// The driver group: every new booking is offered there in Thai with an "Assign" (รับงาน) link. The link
// opens the driver's private chat with the bot; a first-time driver answers the sign-up questions there
// (name, phone, car, licence/ID and car photos), and the job is theirs. Admin sees the driver and the
// customer's details in the team group; the driver gets the full job privately. Being in the group is
// checked with Telegram on every claim, and one guarded write means only one driver can win a job.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const now = () => new Date().toISOString();
export const driverGroup = () => driverGroupConfig(env as unknown as Record<string, unknown>);

let ready: Promise<unknown> | null = null;
/** Workers Builds doesn't run migrations: the tables are created on first use (same as drizzle/0103). */
function ensureTables() {
  ready ??= db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_jobs (booking_reference TEXT PRIMARY KEY, telegram_message_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', holder_telegram_id TEXT, hold_until TEXT, driver_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_links (telegram_user_id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, linked_at TEXT NOT NULL)"),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_telegram_driver_links_driver ON telegram_driver_links(driver_id)"),
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_forms (telegram_user_id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, step TEXT NOT NULL, driver_id TEXT NOT NULL, form_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"),
  ]).catch((error) => { ready = null; throw error; });
  return ready;
}

type BookingRow = { reference: string; status: string; vehicle: string; pickup_date: string; pickup_time: string; pickup: string; dropoff: string; service_type: string | null; booked_hours: number | null;
  passengers: number; luggage: number; return_date: string | null; return_time: string | null; payment_method: string; payment_status: string; total: number; amount_paid: number | null; driver_cost: number | null };
type JobRow = { booking_reference: string; telegram_message_id: number; status: string; holder_telegram_id: string | null; hold_until: string | null; driver_id: string | null };

async function bookingFor(reference: string) {
  return db().prepare(`SELECT b.reference,b.status,b.vehicle,b.pickup_date,b.pickup_time,b.pickup,b.dropoff,b.service_type,b.booked_hours,b.passengers,b.luggage,b.return_date,b.return_time,
      b.payment_method,b.payment_status,b.total,b.amount_paid,NULLIF(COALESCE(NULLIF(c.total_driver_cost,0),c.agreed_driver_cost),0) AS driver_cost
    FROM bookings b LEFT JOIN booking_costs c ON c.booking_reference=b.reference WHERE b.reference=?`).bind(reference).first<BookingRow>();
}

const offerJob = (b: BookingRow): OfferJob => ({
  reference: b.reference, vehicleName: jobVehicleName(b.vehicle), pickupDate: b.pickup_date, pickupTime: b.pickup_time, pickup: b.pickup, dropoff: b.dropoff,
  serviceType: b.service_type, bookedHours: b.booked_hours, passengers: b.passengers, luggage: b.luggage, returnDate: b.return_date, returnTime: b.return_time,
  driverCost: b.driver_cost, paymentMethod: b.payment_method, paymentStatus: b.payment_status, cashDue: Math.max(0, b.total - (b.amount_paid ?? 0)),
});

const pickupPassed = (b: { pickup_date: string; pickup_time: string }) => new Date(`${b.pickup_date}T${b.pickup_time || "00:00"}:00+07:00`).getTime() <= Date.now();

/** Whether staff already set a driver for this booking in the team group (the source of truth). */
async function driverSet(reference: string) {
  const card = await db().prepare("SELECT driver_done FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ driver_done: number }>().catch(() => null);
  const live = await db().prepare("SELECT 1 x FROM booking_assignments WHERE booking_reference=? AND leg='outbound' AND revoked_at IS NULL").bind(reference).first().catch(() => null);
  return Boolean(card?.driver_done || live);
}

async function stateFor(b: BookingRow, job: JobRow | null): Promise<OfferState> {
  if (b.status !== "confirmed") return { kind: "closed", reason: "cancelled" };
  if (job?.status === "taken" && job.driver_id) {
    const d = await db().prepare("SELECT full_name,car_plate FROM drivers WHERE id=?").bind(job.driver_id).first<{ full_name: string; car_plate: string | null }>();
    return { kind: "taken", driverName: d?.full_name ?? "-", plate: d?.car_plate ?? null };
  }
  if (await driverSet(b.reference)) return { kind: "closed", reason: "assigned" };
  if (pickupPassed(b)) return { kind: "closed", reason: "past" };
  return { kind: "open" };
}

async function offerKeyboard(reference: string, state: OfferState): Promise<InlineKeyboard> {
  if (state.kind !== "open") return [];
  const bot = await telegramBotUsername();
  return bot ? [[{ text: "✋ รับงาน (Assign)", url: jobStartLink(bot, reference) }]] : [];
}

/** Posts a new booking to the driver group once (safe to call again). Off unless the owner turned it on. */
export async function postDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return;
  await ensureTables();
  const b = await bookingFor(reference);
  if (!b || b.status !== "confirmed" || pickupPassed(b) || await driverSet(reference)) return;
  const claimed = await db().prepare("INSERT INTO telegram_driver_jobs(booking_reference,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(booking_reference) DO NOTHING").bind(reference, now(), now()).run();
  if (!claimed.meta.changes) return;
  try {
    const state: OfferState = { kind: "open" };
    const sent = await sendTo(group.chatId, offerText(offerJob(b), state), await offerKeyboard(reference, state));
    await db().prepare("UPDATE telegram_driver_jobs SET telegram_message_id=?,updated_at=? WHERE booking_reference=?").bind(sent.message_id, now(), reference).run();
  } catch (error) {
    await db().prepare("DELETE FROM telegram_driver_jobs WHERE booking_reference=? AND telegram_message_id=0").bind(reference).run();
    throw error;
  }
}

/** Redraws a booking's offer: driver cost set, taken, assigned by staff, cancelled or past. */
export async function syncDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return;
  await ensureTables();
  const job = await db().prepare("SELECT * FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<JobRow>();
  const b = job?.telegram_message_id ? await bookingFor(reference) : null;
  if (!job || !b) return;
  const state = await stateFor(b, job);
  if (state.kind === "closed" && job.status === "open") await db().prepare("UPDATE telegram_driver_jobs SET status='closed',holder_telegram_id=NULL,updated_at=? WHERE booking_reference=? AND status='open'").bind(now(), reference).run();
  await editIn(group.chatId, job.telegram_message_id, offerText(offerJob(b), state), await offerKeyboard(reference, state));
}

/** The driver-group message of a booking's offer, for posting trip photos under it. */
export async function driverOfferMessage(reference: string) {
  const group = driverGroup();
  if (!group) return null;
  const row = await db().prepare("SELECT telegram_message_id FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>().catch(() => null);
  return { chatId: group.chatId, messageId: row?.telegram_message_id || undefined };
}

/** Telegram says whether this person is in the driver group right now. Unknown = no (fail closed). */
async function inDriverGroup(userId: number) {
  const group = driverGroup();
  if (!group) return false;
  const member = await tg<{ status?: string; is_member?: boolean }>("getChatMember", { chat_id: group.chatId, user_id: userId }).catch(() => null);
  return isGroupMember(member);
}

async function linkedDriver(userId: number) {
  return db().prepare(`SELECT d.id,d.full_name,d.phone,d.car_plate,d.vehicle,d.vehicle_type FROM telegram_driver_links l JOIN drivers d ON d.id=l.driver_id
    WHERE l.telegram_user_id=? AND d.status='active'`).bind(String(userId)).first<{ id: string; full_name: string; phone: string; car_plate: string | null; vehicle: string; vehicle_type: string | null }>();
}

const say = (chatId: string, text: string, keyboard?: InlineKeyboard) =>
  keyboard ? tg<TelegramMessage>("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } }) : sendPrivate(chatId, text);

/**
 * Holds a job for this driver for HOLD_MINUTES while they confirm or sign up. Only one person can hold
 * an open job; the same person may tap again. Returns a Thai reason when they can't.
 */
export async function holdJob(user: TelegramUser, reference: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!driverGroup()) return { ok: false, reason: "ระบบรับงานทาง Telegram ยังไม่เปิดใช้งาน" };
  await ensureTables();
  if (!await inDriverGroup(user.id)) return { ok: false, reason: "รับงานได้เฉพาะสมาชิกกลุ่มคนขับ Waydidi" };
  const job = await db().prepare("SELECT * FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<JobRow>();
  const b = job ? await bookingFor(reference) : null;
  if (!job || !b) return { ok: false, reason: "ไม่พบงานนี้" };
  const state = await stateFor(b, job);
  if (state.kind !== "open" || job.status !== "open") {
    await syncDriverOffer(reference).catch(() => undefined);
    return { ok: false, reason: state.kind === "closed" && state.reason === "cancelled" ? "งานนี้ถูกยกเลิกแล้ว" : state.kind === "closed" && state.reason === "past" ? "เลยเวลารับงานนี้แล้ว" : "มีคนขับรับงานนี้แล้ว" };
  }
  const at = now(), until = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(), me = String(user.id);
  const held = await db().prepare("UPDATE telegram_driver_jobs SET holder_telegram_id=?,hold_until=?,updated_at=? WHERE booking_reference=? AND status='open' AND (holder_telegram_id IS NULL OR holder_telegram_id=? OR hold_until<?)")
    .bind(me, until, at, reference, me, at).run();
  return held.meta.changes ? { ok: true } : { ok: false, reason: `มีคนขับกำลังรับงานนี้อยู่ ลองใหม่ได้ใน ${HOLD_MINUTES} นาที` };
}

/**
 * Gives the held job to the driver: one guarded write on the offer (still open, still held by this
 * person), then the team group's driver slot (still empty). Staff assigning first always wins.
 */
export async function claimJob(user: TelegramUser, reference: string, driverId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await ensureTables();
  if (!await inDriverGroup(user.id)) return { ok: false, reason: "รับงานได้เฉพาะสมาชิกกลุ่มคนขับ Waydidi" };
  const d = await db().prepare("SELECT id,full_name,phone,car_plate,vehicle,license_number FROM drivers WHERE id=? AND status='active'").bind(driverId)
    .first<{ id: string; full_name: string; phone: string; car_plate: string | null; vehicle: string; license_number: string | null }>();
  if (!d) return { ok: false, reason: "ไม่พบข้อมูลคนขับ" };
  const at = now();
  const taken = await db().prepare("UPDATE telegram_driver_jobs SET status='taken',driver_id=?,holder_telegram_id=NULL,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status='open' AND holder_telegram_id=? AND hold_until>=?")
    .bind(d.id, at, reference, String(user.id), at).run();
  if (!taken.meta.changes) return { ok: false, reason: "หมดเวลาหรือมีคนรับงานนี้แล้ว กดรับงานในกลุ่มอีกครั้ง" };
  const b = await bookingFor(reference);
  const form = { name: d.full_name, phone: d.phone, plate: d.car_plate ?? undefined, model: d.vehicle || undefined, license: d.license_number ?? undefined, driverId: d.id };
  const slot = b?.status === "confirmed"
    ? await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=?,driver_done=1 WHERE booking_reference=? AND driver_done=0").bind(JSON.stringify(form), reference).run()
    : { meta: { changes: 0 } };
  if (!slot.meta.changes || await liveAssignmentByOther(reference, d.id)) {
    // Staff set a driver (or the booking changed) in the meantime: the offer closes, the driver is told.
    await db().prepare("UPDATE telegram_driver_jobs SET status='closed',driver_id=NULL,updated_at=? WHERE booking_reference=? AND driver_id=?").bind(now(), reference, d.id).run();
    if (slot.meta.changes) await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=NULL,driver_done=0 WHERE booking_reference=? AND driver_form_json=?").bind(reference, JSON.stringify(form)).run();
    await syncDriverOffer(reference).catch(() => undefined);
    return { ok: false, reason: "งานนี้มีคนขับแล้ว" };
  }
  const tasks = await import("./booking-tasks");
  const bookings = await import("./bookings");
  // The Thai job with the customer's details goes to the team group (and privately to the driver) once
  // the driver cost is set; until then the team group is told who took it.
  const posted = await tasks.postAssignmentWhenReady(reference, `คนขับ ${d.full_name}`, `✋ <b>${esc(d.full_name)}</b> รับงานจากกลุ่มคนขับ`).catch(() => false);
  if (!posted) await noteTeamGroup(reference, d).catch(() => undefined);
  await bookings.refreshBookingCard(reference).catch(() => undefined);
  await syncDriverOffer(reference).catch(() => undefined);
  return { ok: true };
}

async function liveAssignmentByOther(reference: string, driverId: string) {
  return db().prepare("SELECT 1 x FROM booking_assignments WHERE booking_reference=? AND leg='outbound' AND revoked_at IS NULL AND driver_id<>?").bind(reference, driverId).first().catch(() => null);
}

async function noteTeamGroup(reference: string, d: { id: string; full_name: string; phone: string; car_plate: string | null; vehicle: string }) {
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>();
  const digits = d.phone.replace(/\D/g, "").slice(-9);
  const same = digits.length >= 9 ? await db().prepare("SELECT full_name FROM drivers WHERE id<>? AND status='active' AND REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') LIKE ? LIMIT 1").bind(d.id, `%${digits}`).first<{ full_name: string }>() : null;
  const lines = [`✋ <b>${esc(d.full_name)}</b> รับงาน <b>${esc(reference)}</b> จากกลุ่มคนขับ`, `โทร: ${esc(d.phone)}`, `รถ: ${esc(d.vehicle || "-")} · ทะเบียน ${esc(d.car_plate || "-")}`,
    ...(same ? [`⚠️ เบอร์นี้ตรงกับคนขับเดิม: ${esc(same.full_name)} — ตรวจสอบใน Admin → Drivers`] : []),
    "", "ตั้งราคาค่างาน (Set cost) เพื่อส่งใบงานให้คนขับ"];
  await sendTo(telegramChatId(), lines.join("\n"), undefined, card?.telegram_message_id || undefined);
}

/** The full job (with the customer's details) privately to the driver who took it, if they use Telegram. */
export async function sendJobToLinkedDriver(driverId: string, text: string) {
  if (!driverGroup()) return;
  await ensureTables();
  const { results } = await db().prepare("SELECT telegram_user_id FROM telegram_driver_links WHERE driver_id=?").bind(driverId).all<{ telegram_user_id: string }>();
  for (const r of results) await sendPrivate(r.telegram_user_id, text).catch((error) => console.error("driver job DM failed", error instanceof Error ? error.message : "unknown"));
}

// ——— The private chat ———

const confirmKeyboard = (reference: string): InlineKeyboard => [[{ text: "✅ ยืนยันรับงาน", callback_data: `dj_ok:${reference}` }], [{ text: "✏️ แก้ไขข้อมูลคนขับ/รถ", callback_data: `dj_new:${reference}` }], [{ text: "ยกเลิก", callback_data: `dj_x:${reference}` }]];
const carTypeKeyboard = (reference: string): InlineKeyboard => [Object.entries(CAR_TYPES).map(([k, label]) => ({ text: label, callback_data: `dj_car:${reference}:${k}` }))];

async function ask(chatId: string, reference: string, step: FormStep) {
  const n = ["name", "phone", "plate", "model", "car_type", "id_photo", "car_photo"].indexOf(step) + 1;
  await say(chatId, `งาน <b>${esc(reference)}</b> (${n}/7): ${STEP_QUESTION[step]}`, step === "car_type" ? carTypeKeyboard(reference) : undefined);
}

async function startForm(user: TelegramUser, chatId: string, reference: string, driverId: string) {
  await db().prepare("INSERT INTO telegram_driver_forms(telegram_user_id,booking_reference,step,driver_id,form_json,updated_at) VALUES(?,?,?,?,'{}',?) ON CONFLICT(telegram_user_id) DO UPDATE SET booking_reference=excluded.booking_reference,step=excluded.step,driver_id=excluded.driver_id,form_json='{}',updated_at=excluded.updated_at")
    .bind(String(user.id), reference, "name", driverId, now()).run();
  await say(chatId, "กรอกข้อมูลคนขับครั้งแรก ตอบทีละข้อ (ข้อมูลจะถูกบันทึกไว้ ครั้งต่อไปกดยืนยันได้เลย)");
  await ask(chatId, reference, "name");
}

/** "/start job_REF" from the Assign link. */
async function startClaim(user: TelegramUser, chatId: string, reference: string) {
  const held = await holdJob(user, reference);
  if (!held.ok) { await say(chatId, `❌ ${esc(held.reason)}`); return; }
  const me = await linkedDriver(user.id);
  if (me) {
    await say(chatId, [`งาน <b>${esc(reference)}</b> — ยืนยันรับงานด้วยข้อมูลนี้?`, `คนขับ: ${esc(me.full_name)} · ${esc(me.phone)}`, `รถ: ${esc(me.vehicle || "-")} · ทะเบียน ${esc(me.car_plate || "-")}`, "", `ยืนยันภายใน ${HOLD_MINUTES} นาที`].join("\n"), confirmKeyboard(reference));
    return;
  }
  await startForm(user, chatId, reference, crypto.randomUUID());
}

type FormRow = { telegram_user_id: string; booking_reference: string; step: FormStep; driver_id: string; form_json: string; updated_at: string };
async function activeForm(userId: number) {
  return db().prepare("SELECT * FROM telegram_driver_forms WHERE telegram_user_id=? AND updated_at>?").bind(String(userId), new Date(Date.now() - 30 * 60_000).toISOString()).first<FormRow>();
}

async function saveStep(form: FormRow, draft: DriverDraft, chatId: string, user: TelegramUser) {
  const next = nextStep(form.step);
  if (next) {
    await db().prepare("UPDATE telegram_driver_forms SET step=?,form_json=?,updated_at=? WHERE telegram_user_id=?").bind(next, JSON.stringify(draft), now(), form.telegram_user_id).run();
    await ask(chatId, form.booking_reference, next);
    return;
  }
  await finishForm(form, draft, chatId, user);
}

/** All answers in: the driver is saved (or updated) and linked to this Telegram account, then the job is claimed. */
async function finishForm(form: FormRow, draft: DriverDraft, chatId: string, user: TelegramUser) {
  if (!draft.name || !draft.phone || !draft.plate || !draft.model || !draft.carType || !draft.idPhoto || !draft.carPhoto) { await startForm(user, chatId, form.booking_reference, form.driver_id); return; }
  const at = now(), id = form.driver_id;
  const existing = await db().prepare("SELECT id FROM drivers WHERE id=?").bind(id).first();
  const idKey = `driver-verification/${id}/identity.jpg`, carKey = `driver-verification/${id}/vehicle.jpg`;
  if (existing) {
    await db().prepare("UPDATE drivers SET full_name=?,phone=?,car_plate=?,vehicle=?,vehicle_type=?,id_image_key=?,id_image_mime='image/jpeg',car_image_key=?,car_image_mime='image/jpeg',status='active',updated_at=? WHERE id=?")
      .bind(draft.name, draft.phone, draft.plate, draft.model, draft.carType, idKey, carKey, at, id).run();
  } else {
    await db().prepare("INSERT INTO drivers(id,full_name,phone,base_location,vehicle,vehicle_type,car_plate,id_image_key,id_image_mime,car_image_key,car_image_mime,driver_type,status,created_at,updated_at) VALUES(?,?,?,'Telegram',?,?,?,?,'image/jpeg',?,'image/jpeg','outsource','active',?,?)")
      .bind(id, draft.name, draft.phone, draft.model, draft.carType, draft.plate, idKey, carKey, at, at).run();
  }
  await db().batch([
    db().prepare("INSERT INTO telegram_driver_links(telegram_user_id,driver_id,linked_at) VALUES(?,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET driver_id=excluded.driver_id,linked_at=excluded.linked_at").bind(String(user.id), id, at),
    db().prepare("DELETE FROM telegram_driver_forms WHERE telegram_user_id=?").bind(String(user.id)),
  ]);
  await say(chatId, "บันทึกข้อมูลคนขับแล้ว ✓");
  await finishClaim(user, chatId, form.booking_reference, id);
}

async function finishClaim(user: TelegramUser, chatId: string, reference: string, driverId: string) {
  const result = await claimJob(user, reference, driverId);
  await say(chatId, result.ok ? `✅ รับงาน <b>${esc(reference)}</b> เรียบร้อย\nใบงานพร้อมข้อมูลลูกค้าและลิงก์งานจะส่งมาที่แชทนี้เมื่อแอดมินยืนยันราคา` : `❌ ${esc(result.reason)}`);
}

/** Private messages for drivers. Returns true when handled (otherwise the staff chat handler runs). */
export async function handleDriverPrivate(m: TelegramMessage) {
  if (!m.from || m.from.is_bot) return false;
  const text = (m.text ?? "").trim(), chatId = String(m.chat.id);
  const reference = parseJobStart(text);
  if (reference) { await startClaim(m.from, chatId, reference); return true; }
  if (!driverGroup()) return false;
  await ensureTables();
  if (isMyJobsCommand(text)) { await sendMyJobs(m.from, chatId); return true; }
  const form = await activeForm(m.from.id);
  if (!form) return false;
  const draft = JSON.parse(form.form_json || "{}") as DriverDraft;
  if (form.step === "id_photo" || form.step === "car_photo") {
    const photo = m.photo?.at(-1);
    if (!photo) { await ask(chatId, form.booking_reference, form.step); return true; }
    const bytes = await downloadFile(photo.file_id, 8 * 1024 * 1024).catch(() => null);
    const image = bytes ? await prepareDriverImage(new File([bytes], "photo.jpg", { type: "image/jpeg" }), form.step === "id_photo" ? "ID photo" : "car photo").catch(() => null) : null;
    if (!image) { await say(chatId, "รับรูปไม่สำเร็จ กรุณาส่งใหม่เป็นรูปภาพ (JPG)"); return true; }
    await putFile(`driver-verification/${form.driver_id}/${form.step === "id_photo" ? "identity" : "vehicle"}.jpg`, image.bytes, image.mime);
    if (form.step === "id_photo") draft.idPhoto = true; else draft.carPhoto = true;
    await saveStep(form, draft, chatId, m.from);
    return true;
  }
  if (!text || text.startsWith("/")) { await ask(chatId, form.booking_reference, form.step); return true; }
  const checked = checkTextAnswer(form.step, text);
  if ("error" in checked) { await say(chatId, esc(checked.error), form.step === "car_type" ? carTypeKeyboard(form.booking_reference) : undefined); return true; }
  if (form.step === "name") draft.name = checked.value;
  if (form.step === "phone") draft.phone = checked.value;
  if (form.step === "plate") draft.plate = checked.value;
  if (form.step === "model") draft.model = checked.value;
  await saveStep(form, draft, chatId, m.from);
  return true;
}

/** Buttons in a driver's private chat (dj_…). */
export async function handleDriverCallback(q: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage }) {
  const [action, reference, extra] = (q.data ?? "").split(":");
  const chatId = String(q.message?.chat.id ?? q.from.id);
  if (!reference || !/^[A-Z0-9-]{4,24}$/.test(reference) || !driverGroup()) return answerCallback(q.id, "ไม่พบงานนี้", true);
  await ensureTables();
  if (q.message) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
  if (action === "dj_x") {
    await db().prepare("UPDATE telegram_driver_jobs SET holder_telegram_id=NULL,hold_until=NULL,updated_at=? WHERE booking_reference=? AND holder_telegram_id=? AND status='open'").bind(now(), reference, String(q.from.id)).run();
    await db().prepare("DELETE FROM telegram_driver_forms WHERE telegram_user_id=?").bind(String(q.from.id)).run();
    return answerCallback(q.id, "ยกเลิกแล้ว");
  }
  if (action === "dj_ok") {
    const me = await linkedDriver(q.from.id);
    if (!me) { await startForm(q.from, chatId, reference, crypto.randomUUID()); return answerCallback(q.id); }
    await answerCallback(q.id);
    await finishClaim(q.from, chatId, reference, me.id);
    return;
  }
  if (action === "dj_new") {
    const held = await holdJob(q.from, reference);
    if (!held.ok) { await say(chatId, `❌ ${esc(held.reason)}`); return answerCallback(q.id); }
    const me = await linkedDriver(q.from.id);
    await startForm(q.from, chatId, reference, me?.id ?? crypto.randomUUID());
    return answerCallback(q.id);
  }
  if (action === "dj_car") {
    const form = await activeForm(q.from.id);
    if (!form || form.booking_reference !== reference || form.step !== "car_type" || !isCarType(extra)) return answerCallback(q.id, "กรุณาเริ่มใหม่: กดรับงานในกลุ่มคนขับ", true);
    const draft = JSON.parse(form.form_json || "{}") as DriverDraft;
    draft.carType = extra;
    await answerCallback(q.id, CAR_TYPES[extra]);
    await saveStep(form, draft, chatId, q.from);
    return;
  }
  return answerCallback(q.id, "ไม่รู้จักคำสั่งนี้");
}

/** "งานของฉัน": the driver's upcoming jobs, privately, with each job's link. */
async function sendMyJobs(user: TelegramUser, chatId: string) {
  const me = await linkedDriver(user.id);
  if (!me) { await say(chatId, "ยังไม่ได้ลงทะเบียนคนขับ กด «รับงาน» ในกลุ่มคนขับเพื่อลงทะเบียน"); return; }
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const { results } = await db().prepare(`SELECT a.booking_reference,a.leg,
      CASE WHEN a.leg='return' THEN b.return_date ELSE b.pickup_date END AS date, CASE WHEN a.leg='return' THEN b.return_time ELSE b.pickup_time END AS time,
      CASE WHEN a.leg='return' THEN COALESCE(b.return_pickup,b.dropoff) ELSE b.pickup END AS pickup, CASE WHEN a.leg='return' THEN COALESCE(b.return_dropoff,b.pickup) ELSE b.dropoff END AS dropoff
    FROM booking_assignments a JOIN bookings b ON b.reference=a.booking_reference
    WHERE a.driver_id=? AND a.revoked_at IS NULL AND a.completed_at IS NULL AND b.status='confirmed' AND (CASE WHEN a.leg='return' THEN b.return_date ELSE b.pickup_date END)>=?
    ORDER BY date,time LIMIT 10`).bind(me.id, today).all<{ booking_reference: string; leg: string; date: string; time: string; pickup: string; dropoff: string }>();
  if (!results.length) { await say(chatId, "ยังไม่มีงานที่กำลังจะมาถึง"); return; }
  const lines = ["<b>งานของฉัน</b>"];
  for (const r of results) {
    const [y, mo, d] = r.date.split("-");
    const link = await assignedDriverUrl(r.booking_reference, r.leg).catch(() => null);
    lines.push("", `${d}/${mo}/${y} ${esc(r.time)} · <b>${esc(r.booking_reference)}</b>${r.leg === "return" ? " (ขากลับ)" : ""}`, `${esc(r.pickup)} → ${esc(r.dropoff)}`, ...(link ? [link] : []));
  }
  await say(chatId, lines.join("\n"));
}

/** In the driver group: "งานของฉัน" is answered privately (customer details never go to the group). */
export async function handleDriverGroupMessage(m: TelegramMessage) {
  const text = (m.text ?? "").trim();
  if (!m.from || !isMyJobsCommand(text)) return;
  await ensureTables();
  const sent = await sendMyJobs(m.from, String(m.from.id)).then(() => true).catch(() => false);
  const group = driverGroup();
  const bot = await telegramBotUsername().catch(() => null);
  if (group) await sendTo(group.chatId, sent ? "ส่งรายการงานให้ทางแชทส่วนตัวแล้ว" : `กดเริ่มแชทกับบอทก่อน${bot ? `: https://t.me/${bot}` : ""}`, undefined, m.message_id).catch(() => undefined);
}

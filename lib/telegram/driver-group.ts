import { env } from "cloudflare:workers";
import { prepareDriverImage } from "@/lib/admin-driver-images";
import { putFile } from "@/lib/file-store";
import { assignedDriverUrl } from "@/lib/trip-links";
import { esc } from "./cards";
import { answerCallback, downloadFile, editIn, sendPrivate, sendTo, telegramBotUsername, telegramChatId, tg, type InlineKeyboard, type TelegramMessage, type TelegramUser } from "./client";
import { jobVehicleName } from "./job-text";
import {
  CAR_TYPES, SIGNUP_MINUTES, STEP_QUESTION, checkTextAnswer, driverGroupConfig, isCarType, isGroupMember, isMyJobsCommand, nextStep, offerText, parseSignupStart, signupLink, stepsFor,
  type DriverDraft, type FormStep, type OfferJob, type OfferState,
} from "./driver-group-rules";

// The driver group: once staff set a booking's driver cost, it is offered there in Thai with a
// "รับงาน (Assign)" button. The first driver to tap it gets the job and the post changes to show who
// took it, with no button. In their private chat with the bot, a driver already linked to Telegram
// picks the car («model — plate» or «รถอื่นๆ» to give another car); a first-time driver answers the
// sign-up questions. Either way within SIGNUP_MINUTES, otherwise the job is offered again. Admin sees the driver and the customer's details in the team
// group; the driver gets the full job privately. One guarded write decides who tapped first.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const now = () => new Date().toISOString();
export const driverGroup = () => driverGroupConfig(env as unknown as Record<string, unknown>);

let ready: Promise<unknown> | null = null;
/** Workers Builds doesn't run migrations: the tables are created on first use (same as drizzle/0103). */
function ensureTables() {
  ready ??= db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_jobs (booking_reference TEXT PRIMARY KEY, telegram_message_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', holder_telegram_id TEXT, holder_name TEXT, hold_until TEXT, driver_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_links (telegram_user_id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, linked_at TEXT NOT NULL)"),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_telegram_driver_links_driver ON telegram_driver_links(driver_id)"),
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_forms (telegram_user_id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, step TEXT NOT NULL, driver_id TEXT NOT NULL, form_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"),
  ]).catch((error) => { ready = null; throw error; });
  return ready;
}

type BookingRow = { reference: string; status: string; vehicle: string; pickup_date: string; pickup_time: string; pickup: string; dropoff: string; service_type: string | null; booked_hours: number | null;
  passengers: number; luggage: number; return_date: string | null; return_time: string | null; payment_method: string; payment_status: string; total: number; amount_paid: number | null; driver_cost: number | null };
// status: open → taken (a linked driver tapped) | signing_up (a first-time driver tapped) → taken; or closed.
type JobRow = { booking_reference: string; telegram_message_id: number; status: string; holder_telegram_id: string | null; holder_name: string | null; hold_until: string | null; driver_id: string | null };
type Driver = { id: string; full_name: string; phone: string; car_plate: string | null; vehicle: string; license_number: string | null };

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
    const d = await db().prepare("SELECT full_name FROM drivers WHERE id=?").bind(job.driver_id).first<{ full_name: string }>();
    return { kind: "taken", driverName: d?.full_name ?? job.holder_name ?? "-" };
  }
  // Tapped and now confirming the car or signing up in the private chat: shown as taken by them.
  if (job?.status === "signing_up") return { kind: "taken", driverName: job.holder_name ?? "-" };
  if (await driverSet(b.reference)) return { kind: "closed", reason: "assigned" };
  if (pickupPassed(b)) return { kind: "closed", reason: "past" };
  return { kind: "open" };
}

const offerKeyboard = (reference: string, state: OfferState): InlineKeyboard =>
  state.kind === "open" ? [[{ text: "✋ รับงาน (Assign)", callback_data: `dj_take:${reference}` }]] : [];

/** Posts a booking to the driver group once its cost is set (safe to call again). Off unless the owner turned it on. */
export async function postDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return false;
  await ensureTables();
  const b = await bookingFor(reference);
  // Offered only once staff have set the driver cost, and only while it still needs a driver.
  if (!b || b.status !== "confirmed" || !b.driver_cost || pickupPassed(b) || await driverSet(reference)) return false;
  const claimed = await db().prepare("INSERT INTO telegram_driver_jobs(booking_reference,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(booking_reference) DO NOTHING").bind(reference, now(), now()).run();
  if (!claimed.meta.changes) return false;
  try {
    const state: OfferState = { kind: "open" };
    const sent = await sendTo(group.chatId, offerText(offerJob(b), state), offerKeyboard(reference, state));
    await db().prepare("UPDATE telegram_driver_jobs SET telegram_message_id=?,updated_at=? WHERE booking_reference=?").bind(sent.message_id, now(), reference).run();
    return true;
  } catch (error) {
    await db().prepare("DELETE FROM telegram_driver_jobs WHERE booking_reference=? AND telegram_message_id=0").bind(reference).run();
    throw error;
  }
}

/** Posts the offer once the cost is set, then keeps it current: new cost, taken, assigned by staff, cancelled or past. */
export async function syncDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return;
  await ensureTables();
  const job = await db().prepare("SELECT * FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<JobRow>();
  if (!job) { await postDriverOffer(reference); return; }
  const b = job.telegram_message_id ? await bookingFor(reference) : null;
  if (!b) return;
  const state = await stateFor(b, job);
  if (state.kind === "closed" && job.status !== "closed" && job.status !== "taken") await db().prepare("UPDATE telegram_driver_jobs SET status='closed',holder_telegram_id=NULL,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status IN ('open','signing_up')").bind(now(), reference).run();
  await editIn(group.chatId, job.telegram_message_id, offerText(offerJob(b), state), offerKeyboard(reference, state));
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
  return db().prepare(`SELECT d.id,d.full_name,d.phone,d.car_plate,d.vehicle,d.license_number FROM telegram_driver_links l JOIN drivers d ON d.id=l.driver_id
    WHERE l.telegram_user_id=? AND d.status='active'`).bind(String(userId)).first<Driver>();
}

const say = (chatId: string, text: string, keyboard?: InlineKeyboard) =>
  keyboard ? tg<TelegramMessage>("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } }) : sendPrivate(chatId, text);

const displayName = (u: TelegramUser) => [u.first_name, u.last_name].filter(Boolean).join(" ").trim().slice(0, 60) || (u.username ? `@${u.username}` : "คนขับ");

export type TakeResult = { ok: true; driver: Driver | null } | { ok: false; reason: string };

/**
 * A tap on «รับงาน» in the driver group. The first tap wins (one guarded write on the open offer);
 * the post then shows who took it, with no button. A linked driver is assigned straight away; a
 * first-time driver must send their details within SIGNUP_MINUTES.
 */
export async function takeJob(user: TelegramUser, reference: string): Promise<TakeResult> {
  if (!driverGroup()) return { ok: false, reason: "ระบบรับงานทาง Telegram ยังไม่เปิดใช้งาน" };
  await ensureTables();
  if (!await inDriverGroup(user.id)) return { ok: false, reason: "รับงานได้เฉพาะสมาชิกกลุ่มคนขับ Waydidi" };
  const job = await db().prepare("SELECT * FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<JobRow>();
  const b = job ? await bookingFor(reference) : null;
  if (!job || !b) return { ok: false, reason: "ไม่พบงานนี้" };
  const state = await stateFor(b, job);
  if (state.kind !== "open" || job.status !== "open") {
    await syncDriverOffer(reference).catch(() => undefined);
    return { ok: false, reason: state.kind === "closed" && state.reason === "cancelled" ? "งานนี้ถูกยกเลิกแล้ว" : state.kind === "closed" && state.reason === "past" ? "เลยเวลารับงานนี้แล้ว" : "มีคนรับงานนี้แล้ว" };
  }
  const me = await linkedDriver(user.id);
  const at = now(), until = new Date(Date.now() + SIGNUP_MINUTES * 60_000).toISOString();
  const won = await db().prepare("UPDATE telegram_driver_jobs SET status='signing_up',holder_telegram_id=?,holder_name=?,hold_until=?,driver_id=NULL,updated_at=? WHERE booking_reference=? AND status='open'")
    .bind(String(user.id), me?.full_name ?? displayName(user), until, at, reference).run();
  if (!won.meta.changes) return { ok: false, reason: "มีคนรับงานนี้แล้ว" };
  await syncDriverOffer(reference).catch(() => undefined);
  return { ok: true, driver: me };
}

/** The tapper's job becomes theirs with this driver record (still theirs and still in time), then is assigned. */
async function completeTake(user: TelegramUser, reference: string, d: Driver) {
  const taken = await db().prepare("UPDATE telegram_driver_jobs SET status='taken',driver_id=?,holder_name=?,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status='signing_up' AND holder_telegram_id=? AND hold_until>=?")
    .bind(d.id, d.full_name, now(), reference, String(user.id), now()).run();
  return taken.meta.changes ? assignTaken(reference, d) : false;
}

/**
 * Puts the driver who won the job in the team group's driver slot (still empty: staff choosing a driver
 * first always wins), then posts the job to the team group and privately to the driver.
 */
async function assignTaken(reference: string, d: Driver) {
  const b = await bookingFor(reference);
  const form = { name: d.full_name, phone: d.phone, plate: d.car_plate ?? undefined, model: d.vehicle || undefined, license: d.license_number ?? undefined, driverId: d.id };
  const slot = b?.status === "confirmed"
    ? await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=?,driver_done=1 WHERE booking_reference=? AND driver_done=0").bind(JSON.stringify(form), reference).run()
    : { meta: { changes: 0 } };
  if (slot.meta.changes && b?.driver_cost) {
    // The offer was posted because a cost exists (set in Telegram or in Admin): the card counts it as set.
    await db().prepare("UPDATE telegram_booking_cards SET cost_done=1 WHERE booking_reference=? AND cost_done=0").bind(reference).run();
  }
  if (!slot.meta.changes || await liveAssignmentByOther(reference, d.id)) {
    await db().prepare("UPDATE telegram_driver_jobs SET status='closed',driver_id=NULL,holder_telegram_id=NULL,updated_at=? WHERE booking_reference=?").bind(now(), reference).run();
    if (slot.meta.changes) await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=NULL,driver_done=0 WHERE booking_reference=? AND driver_form_json=?").bind(reference, JSON.stringify(form)).run();
    await syncDriverOffer(reference).catch(() => undefined);
    return false;
  }
  const tasks = await import("./booking-tasks");
  const bookings = await import("./bookings");
  // The Thai job with the customer's details goes to the team group and privately to the driver
  // (the cost is always set by now); without a cost the team group is told who took it.
  // A short line first ("รถทะเบียน … รับงาน REF"), then the job with the customer's details.
  await sendTo(telegramChatId(), `รถทะเบียน <b>${esc(d.car_plate || "-")}</b> รับงาน <b>${esc(reference)}</b>`, undefined, await teamCardMessage(reference)).catch(() => undefined);
  const posted = await tasks.postAssignmentWhenReady(reference, `คนขับ ${d.full_name}`, `✋ ${esc(d.car_plate || d.full_name)} รับงานจากกลุ่มคนขับ${await samePhoneWarning(d)}`).catch(() => false);
  if (!posted) await noteTeamGroup(reference, d).catch(() => undefined);
  await bookings.refreshBookingCard(reference).catch(() => undefined);
  await syncDriverOffer(reference).catch(() => undefined);
  return true;
}

async function liveAssignmentByOther(reference: string, driverId: string) {
  return db().prepare("SELECT 1 x FROM booking_assignments WHERE booking_reference=? AND leg='outbound' AND revoked_at IS NULL AND driver_id<>?").bind(reference, driverId).first().catch(() => null);
}

async function samePhoneWarning(d: Driver) {
  const digits = d.phone.replace(/\D/g, "").slice(-9);
  const same = digits.length >= 9 ? await db().prepare("SELECT full_name FROM drivers WHERE id<>? AND status='active' AND REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') LIKE ? LIMIT 1").bind(d.id, `%${digits}`).first<{ full_name: string }>().catch(() => null) : null;
  return same ? `\n⚠️ เบอร์นี้ตรงกับคนขับเดิม: ${esc(same.full_name)} — ตรวจสอบใน Admin → Drivers` : "";
}

const teamCardMessage = async (reference: string) =>
  (await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>().catch(() => null))?.telegram_message_id || undefined;

async function noteTeamGroup(reference: string, d: Driver) {
  const card = { telegram_message_id: await teamCardMessage(reference) };
  const lines = [`✋ <b>${esc(d.full_name)}</b> รับงาน <b>${esc(reference)}</b> จากกลุ่มคนขับ${await samePhoneWarning(d)}`, `โทร: ${esc(d.phone)}`, `รถ: ${esc(d.vehicle || "-")} · ทะเบียน ${esc(d.car_plate || "-")}`,
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

/** Every minute: a driver who did not choose a car or finish signing up in time loses the job; it is offered again. */
export async function reopenLapsedSignups(at = new Date()) {
  if (!driverGroup()) return;
  await ensureTables();
  const { results } = await db().prepare("SELECT booking_reference,holder_telegram_id FROM telegram_driver_jobs WHERE status='signing_up' AND hold_until<? LIMIT 20").bind(at.toISOString()).all<{ booking_reference: string; holder_telegram_id: string | null }>();
  for (const r of results) {
    const reopened = await db().prepare("UPDATE telegram_driver_jobs SET status='open',holder_telegram_id=NULL,holder_name=NULL,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status='signing_up' AND hold_until<?").bind(now(), r.booking_reference, at.toISOString()).run();
    if (!reopened.meta.changes) continue;
    if (r.holder_telegram_id) {
      await db().prepare("DELETE FROM telegram_driver_forms WHERE telegram_user_id=? AND booking_reference=?").bind(r.holder_telegram_id, r.booking_reference).run();
      await sendPrivate(r.holder_telegram_id, `⏱ หมดเวลายืนยันรับงาน งาน <b>${esc(r.booking_reference)}</b> ถูกเปิดให้คนขับอื่นรับแล้ว`).catch(() => undefined);
    }
    await syncDriverOffer(r.booking_reference).catch((error) => console.error("driver offer reopen failed", error instanceof Error ? error.message : "unknown"));
  }
}

// ——— The private chat (first-time sign-up) ———

const cancelKeyboard = (reference: string): InlineKeyboard => [[{ text: "ยกเลิกการรับงาน", callback_data: `dj_x:${reference}` }]];
const carLabel = (d: { vehicle: string; car_plate: string | null }) => `${d.vehicle || "รถของฉัน"} — ${d.car_plate || "-"}`.slice(0, 60);
const carTypeKeyboard = (reference: string): InlineKeyboard => [Object.entries(CAR_TYPES).map(([k, label]) => ({ text: label, callback_data: `dj_car:${reference}:${k}` }))];

async function ask(chatId: string, reference: string, step: FormStep, mode: "driver" | "car" = "driver") {
  const steps = stepsFor(mode);
  await say(chatId, `งาน <b>${esc(reference)}</b> (${steps.indexOf(step) + 1}/${steps.length}): ${STEP_QUESTION[step]}`, step === "car_type" ? carTypeKeyboard(reference) : undefined);
}

/** A returning driver: which car for this job? Their saved car, or «รถอื่นๆ» to give another one. */
async function askCar(chatId: string, reference: string, d: Driver) {
  return say(chatId, [`✅ คุณได้งาน <b>${esc(reference)}</b>`, `เลือกรถที่ใช้วิ่งงานนี้ภายใน ${SIGNUP_MINUTES} นาที`].join("\n"),
    [[{ text: carLabel(d), callback_data: `dj_use:${reference}` }], [{ text: "รถอื่นๆ", callback_data: `dj_other:${reference}` }], [{ text: "ยกเลิกการรับงาน", callback_data: `dj_x:${reference}` }]]).then(() => true).catch(() => false);
}

/** The job this person tapped and must now sign up for (still theirs, still in time). */
async function signupJob(userId: number, reference: string) {
  return db().prepare("SELECT * FROM telegram_driver_jobs WHERE booking_reference=? AND status='signing_up' AND holder_telegram_id=? AND hold_until>=?").bind(reference, String(userId), now()).first<JobRow>();
}

/**
 * Starts (or restarts) the questions in the private chat: the whole sign-up for a first-time driver, or
 * only the car for a returning driver on another car. Returns false if Telegram can't reach the person yet.
 */
async function startForm(user: TelegramUser, chatId: string, reference: string, car?: Driver) {
  const mode = car ? "car" : "driver";
  const intro = await say(chatId, car ? `ใส่ข้อมูลรถที่ใช้วิ่งงาน <b>${esc(reference)}</b> ตอบทีละข้อ`
    : [`✅ คุณได้งาน <b>${esc(reference)}</b>`, `กรอกข้อมูลคนขับครั้งแรกภายใน ${SIGNUP_MINUTES} นาที ตอบทีละข้อ`, "ครั้งต่อไปกด «รับงาน» แล้วเลือกรถได้เลย"].join("\n"), cancelKeyboard(reference)).then(() => true).catch(() => false);
  if (!intro) return false;
  const first = stepsFor(mode)[0];
  await db().prepare("INSERT INTO telegram_driver_forms(telegram_user_id,booking_reference,step,driver_id,form_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET booking_reference=excluded.booking_reference,step=excluded.step,driver_id=excluded.driver_id,form_json=excluded.form_json,updated_at=excluded.updated_at")
    .bind(String(user.id), reference, first, car?.id ?? crypto.randomUUID(), JSON.stringify({ mode }), now()).run();
  await ask(chatId, reference, first, mode);
  return true;
}

type FormRow = { telegram_user_id: string; booking_reference: string; step: FormStep; driver_id: string; form_json: string; updated_at: string };
async function activeForm(userId: number) {
  return db().prepare("SELECT * FROM telegram_driver_forms WHERE telegram_user_id=? AND updated_at>?").bind(String(userId), new Date(Date.now() - SIGNUP_MINUTES * 60_000).toISOString()).first<FormRow>();
}

async function saveStep(form: FormRow, draft: DriverDraft, chatId: string, user: TelegramUser) {
  const next = nextStep(form.step, draft.mode);
  if (next) {
    await db().prepare("UPDATE telegram_driver_forms SET step=?,form_json=?,updated_at=? WHERE telegram_user_id=?").bind(next, JSON.stringify(draft), now(), form.telegram_user_id).run();
    await ask(chatId, form.booking_reference, next, draft.mode);
    return;
  }
  await finishForm(form, draft, chatId, user);
}

/**
 * All answers in. First time: the driver is saved and linked to this Telegram account. Another car: the
 * driver's car (plate, model, type, photo) is updated. Then the job becomes theirs.
 */
async function finishForm(form: FormRow, draft: DriverDraft, chatId: string, user: TelegramUser) {
  const car = draft.mode === "car";
  const complete = draft.plate && draft.model && draft.carType && draft.carPhoto && (car || (draft.name && draft.phone && draft.idPhoto));
  const me = car ? await linkedDriver(user.id) : null;
  if (!complete || (car && me?.id !== form.driver_id)) { await startForm(user, chatId, form.booking_reference, me ?? undefined); return; }
  const at = now(), id = form.driver_id;
  const carKey = `driver-verification/${id}/vehicle.jpg`;
  await db().batch([
    car
      ? db().prepare("UPDATE drivers SET car_plate=?,vehicle=?,vehicle_type=?,car_image_key=?,car_image_mime='image/jpeg',updated_at=? WHERE id=?").bind(draft.plate, draft.model, draft.carType, carKey, at, id)
      : db().prepare("INSERT INTO drivers(id,full_name,phone,base_location,vehicle,vehicle_type,car_plate,id_image_key,id_image_mime,car_image_key,car_image_mime,driver_type,status,created_at,updated_at) VALUES(?,?,?,'Telegram',?,?,?,?,'image/jpeg',?,'image/jpeg','outsource','active',?,?) ON CONFLICT(id) DO NOTHING")
        .bind(id, draft.name, draft.phone, draft.model, draft.carType, draft.plate, `driver-verification/${id}/identity.jpg`, carKey, at, at),
    db().prepare("INSERT INTO telegram_driver_links(telegram_user_id,driver_id,linked_at) VALUES(?,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET driver_id=excluded.driver_id,linked_at=excluded.linked_at").bind(String(user.id), id, at),
    db().prepare("DELETE FROM telegram_driver_forms WHERE telegram_user_id=?").bind(String(user.id)),
  ]);
  const d: Driver = { id, full_name: car ? me!.full_name : draft.name!, phone: car ? me!.phone : draft.phone!, car_plate: draft.plate!, vehicle: draft.model!, license_number: car ? me!.license_number : null };
  const ok = await completeTake(user, form.booking_reference, d);
  await say(chatId, `${car ? "บันทึกข้อมูลรถแล้ว ✓" : "บันทึกข้อมูลคนขับแล้ว ✓"}\n${ok ? `✅ งาน <b>${esc(form.booking_reference)}</b> เป็นของคุณ ใบงานพร้อมข้อมูลลูกค้าและลิงก์งานส่งมาในแชทนี้`
    : "❌ แต่หมดเวลาหรืองานนี้มีคนขับแล้ว"}`);
}

/** Private messages for drivers. Returns true when handled (otherwise the staff chat handler runs). */
export async function handleDriverPrivate(m: TelegramMessage) {
  if (!m.from || m.from.is_bot) return false;
  const text = (m.text ?? "").trim(), chatId = String(m.chat.id);
  const reference = parseSignupStart(text);
  if (reference) {
    if (!driverGroup()) { await say(chatId, "ระบบรับงานทาง Telegram ยังไม่เปิดใช้งาน"); return true; }
    await ensureTables();
    if (!await signupJob(m.from.id, reference)) { await say(chatId, `❌ งาน <b>${esc(reference)}</b> ไม่ได้รอข้อมูลจากคุณแล้ว (หมดเวลาหรือมีคนขับแล้ว)`); return true; }
    const me = await linkedDriver(m.from.id);
    if (me) await askCar(chatId, reference, me); else await startForm(m.from, chatId, reference);
    return true;
  }
  if (!driverGroup()) return false;
  await ensureTables();
  if (isMyJobsCommand(text)) { await sendMyJobs(m.from, chatId); return true; }
  const form = await activeForm(m.from.id);
  if (!form) return false;
  const draft = JSON.parse(form.form_json || "{}") as DriverDraft;
  if (form.step === "id_photo" || form.step === "car_photo") {
    const photo = m.photo?.at(-1);
    if (!photo) { await ask(chatId, form.booking_reference, form.step, draft.mode); return true; }
    const bytes = await downloadFile(photo.file_id, 8 * 1024 * 1024).catch(() => null);
    const image = bytes ? await prepareDriverImage(new File([bytes], "photo.jpg", { type: "image/jpeg" }), form.step === "id_photo" ? "ID photo" : "car photo").catch(() => null) : null;
    if (!image) { await say(chatId, "รับรูปไม่สำเร็จ กรุณาส่งใหม่เป็นรูปภาพ (JPG)"); return true; }
    await putFile(`driver-verification/${form.driver_id}/${form.step === "id_photo" ? "identity" : "vehicle"}.jpg`, image.bytes, image.mime);
    if (form.step === "id_photo") draft.idPhoto = true; else draft.carPhoto = true;
    await saveStep(form, draft, chatId, m.from);
    return true;
  }
  if (!text || text.startsWith("/")) { await ask(chatId, form.booking_reference, form.step, draft.mode); return true; }
  const checked = checkTextAnswer(form.step, text);
  if ("error" in checked) { await say(chatId, esc(checked.error), form.step === "car_type" ? carTypeKeyboard(form.booking_reference) : undefined); return true; }
  if (form.step === "name") draft.name = checked.value;
  if (form.step === "phone") draft.phone = checked.value;
  if (form.step === "plate") draft.plate = checked.value;
  if (form.step === "model") draft.model = checked.value;
  await saveStep(form, draft, chatId, m.from);
  return true;
}

/** «รับงาน» in the driver group (dj_take). The answer is shown only to the person who tapped. */
export async function handleDriverTake(q: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage }) {
  const reference = (q.data ?? "").split(":")[1] ?? "";
  if (!/^[A-Z0-9-]{4,24}$/.test(reference)) return answerCallback(q.id, "ไม่พบงานนี้", true);
  const result = await takeJob(q.from, reference);
  if (!result.ok) return answerCallback(q.id, result.reason, true);
  // The next step happens in their private chat: choose the car (returning driver) or sign up (first time).
  const reached = result.driver ? await askCar(String(q.from.id), reference, result.driver) : await startForm(q.from, String(q.from.id), reference);
  if (reached) return answerCallback(q.id, `✅ ได้งาน ${reference} แล้ว ${result.driver ? "เลือกรถ" : "กรอกข้อมูลคนขับ"}ในแชทส่วนตัวกับบอทภายใน ${SIGNUP_MINUTES} นาที`, true);
  // Never opened the bot: Telegram opens it for them with the link (continues from /start reg_REF).
  const bot = await telegramBotUsername().catch(() => null);
  return bot ? tg("answerCallbackQuery", { callback_query_id: q.id, url: signupLink(bot, reference) }).catch(() => undefined) : answerCallback(q.id, "กดเริ่มแชทกับบอทก่อน", true);
}

/** Buttons in a driver's private chat (dj_car, dj_x). */
export async function handleDriverCallback(q: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage }) {
  const [action, reference, extra] = (q.data ?? "").split(":");
  const chatId = String(q.message?.chat.id ?? q.from.id);
  if (!reference || !/^[A-Z0-9-]{4,24}$/.test(reference) || !driverGroup()) return answerCallback(q.id, "ไม่พบงานนี้", true);
  await ensureTables();
  if (action === "dj_x") {
    // Gives the job back before signing up: it is offered to the group again.
    const released = await db().prepare("UPDATE telegram_driver_jobs SET status='open',holder_telegram_id=NULL,holder_name=NULL,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status='signing_up' AND holder_telegram_id=?").bind(now(), reference, String(q.from.id)).run();
    await db().prepare("DELETE FROM telegram_driver_forms WHERE telegram_user_id=? AND booking_reference=?").bind(String(q.from.id), reference).run();
    if (q.message) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    if (released.meta.changes) await syncDriverOffer(reference).catch(() => undefined);
    return answerCallback(q.id, released.meta.changes ? "ยกเลิกแล้ว งานถูกเปิดให้คนขับอื่น" : "ยกเลิกแล้ว");
  }
  if (action === "dj_use" || action === "dj_other") {
    const me = await linkedDriver(q.from.id);
    if (!me || !await signupJob(q.from.id, reference)) return answerCallback(q.id, "หมดเวลาหรืองานนี้ไม่ได้รอคุณแล้ว", true);
    if (q.message) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    await answerCallback(q.id);
    if (action === "dj_other") { await startForm(q.from, chatId, reference, me); return; }
    const ok = await completeTake(q.from, reference, me);
    await say(chatId, ok ? `✅ งาน <b>${esc(reference)}</b> เป็นของคุณ (${esc(carLabel(me))})\nใบงานพร้อมข้อมูลลูกค้าและลิงก์งานส่งมาในแชทนี้` : "❌ หมดเวลาหรืองานนี้มีคนขับแล้ว");
    return;
  }
  if (action === "dj_car") {
    const form = await activeForm(q.from.id);
    if (!form || form.booking_reference !== reference || form.step !== "car_type" || !isCarType(extra)) return answerCallback(q.id, "กรุณาเริ่มใหม่: กด «รับงาน» ในกลุ่มคนขับ", true);
    if (q.message) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
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

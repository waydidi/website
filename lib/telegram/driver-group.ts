import { ensureReliabilityTables } from "./reliability-db";
import { assignDriver } from "@/lib/assignment-service";
import { deliverAssignmentTelegram } from "./assignments";
import { queueTelegram } from "./outbox";
import { env } from "cloudflare:workers";
import { prepareDriverImage } from "@/lib/admin-driver-images";
import { putFile } from "@/lib/file-store";
import { assignedDriverUrl } from "@/lib/trip-links";
import { esc } from "./cards";
import { answerCallback, downloadFile, editIn, sendPrivate, sendTo, telegramBotUsername, telegramChatId, tg, type InlineKeyboard, type TelegramMessage, type TelegramUser } from "./client";
import { jobVehicleName } from "./job-text";
import {
  driverJobIdentity, driverJobLeg, CAR_TYPES, SIGNUP_MINUTES, STEP_QUESTION, checkTextAnswer, driverGroupConfig, groupChatFor, isDriverGroupChat, isCarType, isGroupMember, isMyJobsCommand, nextStep, offerText, parseSignupStart, signupLink, stepsFor,
  type DriverDraft, type FormStep, type OfferJob, type OfferState,
} from "./driver-group-rules";

// The driver group: once staff set a booking's driver cost, it is offered there in Thai with a
// "รับงาน (Assign)" button. The first driver to tap it gets the job and the post changes to show who
// took it, with no button. In their private chat with the bot, a driver already linked to Telegram
// picks the car («model — plate» or «รถอื่นๆ» to give another car); a first-time driver answers the
// sign-up questions. Either way within SIGNUP_MINUTES, otherwise the job is offered again. Admin sees the driver and the customer's details in the team
// group; the driver gets the full job privately. One guarded write decides who tapped first.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };
const now = () => new Date().toISOString();
export const driverGroup = () => driverGroupConfig(env as unknown as Record<string, unknown>);

let ready: Promise<unknown> | null = null;
/** Workers Builds doesn't run migrations: the tables are created on first use (same as drizzle/0103 and 0104). */
function ensureTables() {
  ready ??= db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_jobs (booking_reference TEXT PRIMARY KEY, telegram_message_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', holder_telegram_id TEXT, holder_name TEXT, hold_until TEXT, driver_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db().prepare("CREATE TABLE IF NOT EXISTS telegram_driver_job_chats (booking_reference TEXT PRIMARY KEY, chat_id TEXT NOT NULL)"),
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

async function bookingFor(key:string) {
  const {reference,leg}=driverJobLeg(key),back=leg==='return';
  if (back && (env as unknown as Record<string,string>).TELEGRAM_RETURN_DRIVER_JOBS!=='1') return null;
  await ensureReliabilityTables();
  const returnCost=back?await db().prepare("SELECT cost_minor FROM telegram_driver_leg_costs WHERE booking_reference=? AND leg='return'").bind(reference).first<{cost_minor:number}>():null;
  const b=await db().prepare(`SELECT b.reference,b.status,b.vehicle,b.pickup_date,b.pickup_time,b.pickup,b.dropoff,b.service_type,b.booked_hours,b.passengers,b.luggage,b.return_date,b.return_time,b.return_pickup,b.return_dropoff,b.payment_method,b.payment_status,b.total,b.amount_paid,
    NULLIF(COALESCE(NULLIF(c.total_driver_cost,0),c.agreed_driver_cost),0) AS driver_cost,j.status leg_status,j.pickup_date leg_date,j.pickup_time leg_time
    FROM bookings b LEFT JOIN booking_costs c ON c.booking_reference=b.reference LEFT JOIN journey_legs j ON j.booking_reference=b.reference AND j.leg=? WHERE b.reference=?`).bind(leg,reference).first<BookingRow & {return_pickup:string|null;return_dropoff:string|null;leg_status:string|null;leg_date:string|null;leg_time:string|null}>();
  if (!b || (back && (!b.return_date || !b.return_time))) return null;
  return {...b,driver_cost:back?(returnCost?.cost_minor??0)/100:b.driver_cost,reference:key,status:b.status==='confirmed' && b.leg_status && b.leg_status!=='pending_payment'?b.leg_status:b.status,pickup_date:b.leg_date??(back?b.return_date!:b.pickup_date),pickup_time:b.leg_time??(back?b.return_time!:b.pickup_time),pickup:back?b.return_pickup||b.dropoff:b.pickup,dropoff:back?b.return_dropoff||b.pickup:b.dropoff,service_type:back?'transfer':b.service_type,booked_hours:back?null:b.booked_hours,return_date:null,return_time:null};
}

const offerJob = (b: BookingRow): OfferJob => ({
  reference: b.reference, vehicleName: jobVehicleName(b.vehicle), pickupDate: b.pickup_date, pickupTime: b.pickup_time, pickup: b.pickup, dropoff: b.dropoff,
  serviceType: b.service_type, bookedHours: b.booked_hours, passengers: b.passengers, luggage: b.luggage, returnDate: b.return_date, returnTime: b.return_time,
  driverCost: b.driver_cost, paymentMethod: b.payment_method, paymentStatus: b.payment_status, cashDue: Math.max(0, b.total - (b.amount_paid ?? 0)),
});

const pickupPassed = (b: { pickup_date: string; pickup_time: string }) => new Date(`${b.pickup_date}T${b.pickup_time || "00:00"}:00+07:00`).getTime() <= Date.now();

/** Whether staff already set a driver for this booking in the team group (the source of truth). */
async function driverSet(key:string) {
  const {reference,leg}=driverJobLeg(key);
  const card=leg==='outbound'?await db().prepare("SELECT driver_done FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{driver_done:number}>():null;
  const live=await db().prepare("SELECT 1 x FROM booking_assignments WHERE booking_reference=? AND leg=? AND revoked_at IS NULL").bind(reference,leg).first();
  return Boolean(card?.driver_done||live);
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

/**
 * The driver group a job was offered in: the one saved with it (the south group); a job offered before the south
 * group existed stays in the main group; a job not offered yet goes where its pickup says.
 */
async function chatForJob(reference: string, group: { chatId: string; southChatId: string | null }) {
  const row = await db().prepare("SELECT chat_id FROM telegram_driver_job_chats WHERE booking_reference=?").bind(reference).first<{ chat_id: string }>().catch(() => null);
  if (row?.chat_id) return row.chat_id;
  if (!group.southChatId) return group.chatId;
  const offered = await db().prepare("SELECT 1 x FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first().catch(() => null);
  if (offered) return group.chatId;
  const b = await bookingFor(reference).catch(() => null);
  return b ? groupChatFor(group, b.pickup) : group.chatId;
}

/** Posts a booking to the driver group once its cost is set (safe to call again). Off unless the owner turned it on. */
export async function postDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return false;
  await ensureTables();
  const b = await bookingFor(reference);
  // Offered only once staff have set the driver cost, and only while it still needs a driver.
  if (!b || b.status !== "confirmed" || !b.driver_cost || pickupPassed(b) || await driverSet(reference)) return false;
  // A pickup in the south goes to the south group (when there is one), everything else to the main group.
  const chatId = groupChatFor(group, b.pickup);
  const [claimed] = await db().batch([
    db().prepare("INSERT INTO telegram_driver_jobs(booking_reference,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(booking_reference) DO NOTHING").bind(reference, now(), now()),
    db().prepare("INSERT OR IGNORE INTO telegram_driver_job_chats(booking_reference,chat_id) VALUES(?,?)").bind(reference, chatId),
  ]);
  if (!claimed.meta.changes) {
    const existing=await db().prepare("SELECT telegram_message_id FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<{telegram_message_id:number}>();
    if (existing?.telegram_message_id) return false;
  }
  {
    const state: OfferState = { kind: "open" };
    await queueTelegram({id:`driver-offer:${reference}`,legacyUncertain:!claimed.meta.changes,reference:driverJobLeg(reference).reference,leg:driverJobLeg(reference).leg,destination:chatId,payload:{text:offerText(offerJob(b),state),keyboard:offerKeyboard(reference,state),target:{kind:"driver_offer",id:reference},activeBooking:true}});
    return true;
  }
}

/** Posts the offer once the cost is set, then keeps it current: new cost, taken, assigned by staff, cancelled or past. */
export async function syncDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return;
  await ensureTables();
  const job = await db().prepare("SELECT * FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<JobRow>();
  if (!job) {
    await postDriverOffer(reference);
    if (driverJobLeg(reference).leg==='outbound') await syncDriverOffer(driverJobIdentity(reference,'return'));
    return;
  }
  if (!job.telegram_message_id) { await postDriverOffer(reference); return; }
  const b = await bookingFor(reference);
  if (!b) return;
  const state = await stateFor(b, job);
  if (state.kind === "closed" && job.status !== "closed" && job.status !== "taken") await db().prepare("UPDATE telegram_driver_jobs SET status='closed',holder_telegram_id=NULL,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status IN ('open','signing_up')").bind(now(), reference).run();
  await editIn(await chatForJob(reference, group), job.telegram_message_id, offerText(offerJob(b), state), offerKeyboard(reference, state));
  if (driverJobLeg(reference).leg==='outbound') await syncDriverOffer(driverJobIdentity(reference,'return'));
}

/**
 * The job is being given to a new driver (the booking was edited): its post in the driver group says so and the
 * offer is forgotten, so the next one (after the new driver cost is set) is posted fresh.
 */
export async function withdrawDriverOffer(reference: string) {
  const group = driverGroup();
  if (!group) return;
  await ensureTables();
  const job = await db().prepare("SELECT telegram_message_id FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>();
  if (!job) return;
  const chatId = await chatForJob(reference, group);
  if (job.telegram_message_id) await editIn(chatId, job.telegram_message_id, `🔄 งาน <b>${esc(reference)}</b> มีการเปลี่ยนแปลง กำลังหาคนขับใหม่`, []).catch(() => undefined);
  await db().batch([
    db().prepare("DELETE FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference),
    db().prepare("DELETE FROM telegram_driver_job_chats WHERE booking_reference=?").bind(reference),
  ]);
}

/** The driver-group message of a booking's offer, for posting trip photos under it. */
export async function driverOfferMessage(reference: string,leg="outbound") {
  reference=driverJobIdentity(reference,leg);
  const group = driverGroup();
  if (!group) return null;
  const row = await db().prepare("SELECT telegram_message_id FROM telegram_driver_jobs WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>().catch(() => null);
  return { chatId: await chatForJob(reference, group), messageId: row?.telegram_message_id || undefined };
}

/** Telegram says whether this person is in the driver group right now. Unknown = no (fail closed). */
async function inDriverGroup(userId: number, chatId: string) {
  if (!driverGroup()) return false;
  const member = await tg<{ status?: string; is_member?: boolean }>("getChatMember", { chat_id: chatId, user_id: userId }).catch(() => null);
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
  // The driver must be in the group this job was offered in (the south group for a southern job).
  if (!await inDriverGroup(user.id, await chatForJob(reference, driverGroup()!))) return { ok: false, reason: "รับงานได้เฉพาะสมาชิกกลุ่มคนขับ Waydidi" };
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
async function completeTake(user: TelegramUser, reference: string, d: Driver, kind: DocsKind) {
  const held=await signupJob(user.id,reference);
  const ok=held ? await assignTaken(reference,d,String(user.id)) : false;
  if (ok) await db().prepare("UPDATE telegram_driver_jobs SET status='taken',driver_id=?,holder_name=?,hold_until=NULL,updated_at=? WHERE booking_reference=? AND holder_telegram_id=? AND status='signing_up'").bind(d.id,d.full_name,now(),reference,String(user.id)).run();
  if (ok) await syncDriverOffer(reference);
  // Every job taken from the driver group: the driver's licence/ID and car photos go to the team group for checking.
  if (ok) await postDriverPhotos(reference, d.id, kind).catch((error) => console.error("driver photos to team group failed", error instanceof Error ? error.message : "unknown"));
  return ok;
}

/**
 * Puts the driver who won the job in the team group's driver slot (still empty: staff choosing a driver
 * first always wins), then posts the job to the team group and privately to the driver.
 */
async function assignTaken(reference: string, d: Driver,holderId:string) {
  const identity=driverJobLeg(reference);
  if (identity.leg==='return') {
    const version=await db().prepare("SELECT booking_version FROM bookings WHERE reference=?").bind(identity.reference).first<{booking_version:number}>();
    const committed=await assignDriver({reference:identity.reference,leg:'return',driverId:d.id,by:`telegram:driver ${d.full_name}`,expectedVersion:version?.booking_version,expectedAssignmentId:null,idempotencyKey:`driver-offer:${reference}:${version?.booking_version}:${d.id}`,telegramHeader:`✋ ${esc(d.car_plate||d.full_name)} รับงานขากลับจากกลุ่มคนขับ`,telegramDriverDm:true,telegramReplyTo:await teamCardMessage(reference),offerKey:reference,holderId});
    if (!committed.ok) return false;
    await deliverAssignmentTelegram(committed.assignment.id);
    await syncDriverOffer(reference);
    return true;
  }
  const b = await bookingFor(reference);
  const form = { name: d.full_name, phone: d.phone, plate: d.car_plate ?? undefined, model: d.vehicle || undefined, license: d.license_number ?? undefined, driverId: d.id };
  const formJson = JSON.stringify(form);
  let slot = b?.status === "confirmed"
    ? await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=?,driver_done=1 WHERE booking_reference=? AND driver_done=0").bind(formJson, reference).run()
    : { meta: { changes: 0 } };
  // The same driver's earlier try stopped half way (the form is saved, nothing was assigned): carry on instead of closing the job.
  if (!slot.meta.changes && b?.status === "confirmed" && await db().prepare("SELECT 1 x FROM telegram_booking_cards WHERE booking_reference=? AND driver_done=1 AND driver_form_json=?").bind(reference, formJson).first()) slot = { meta: { changes: 1 } };
  if (slot.meta.changes && b?.driver_cost) {
    // The offer was posted because a cost exists (set in Telegram or in Admin): the card counts it as set.
    await db().prepare("UPDATE telegram_booking_cards SET cost_done=1 WHERE booking_reference=? AND cost_done=0").bind(reference).run();
  }
  if (!slot.meta.changes || await liveAssignmentByOther(reference, d.id)) {
    await db().prepare("UPDATE telegram_driver_jobs SET status='closed',driver_id=NULL,holder_telegram_id=NULL,updated_at=? WHERE booking_reference=?").bind(now(), reference).run();
    if (slot.meta.changes) await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=NULL,driver_done=0 WHERE booking_reference=? AND driver_form_json=?").bind(reference, formJson).run();
    await syncDriverOffer(reference).catch(() => undefined);
    return false;
  }
  // Whatever goes wrong from here, the driver slot and the job go back as they were, so the driver can tap again
  // and the team sees why (a half-done take used to leave the card "driver set" with nobody assigned).
  const giveBack = () => db().batch([
    db().prepare("UPDATE telegram_booking_cards SET driver_done=0,driver_form_json=NULL WHERE booking_reference=? AND driver_form_json=?").bind(reference, formJson),
    db().prepare("UPDATE telegram_driver_jobs SET status='open',driver_id=NULL,holder_telegram_id=NULL,holder_name=NULL,hold_until=NULL WHERE booking_reference=? AND holder_telegram_id=?").bind(reference, holderId),
  ]);
  try {
    const tasks = await import("./booking-tasks");
    const bookings = await import("./bookings");
    // The Thai job with the customer's details goes to the team group and privately to the driver
    // (the cost is always set by now); without a cost the team group is told who took it.
    // A short line first ("รถทะเบียน … รับงาน REF"), then the job with the customer's details.
    await sendTo(telegramChatId(), `รถทะเบียน <b>${esc(d.car_plate || "-")}</b> รับงาน <b>${esc(reference)}</b> ✅`, undefined, await teamCardMessage(reference)).catch(() => undefined);
    const posted = await tasks.postAssignmentWhenReady(reference, `คนขับ ${d.full_name}`, `✋ ${esc(d.car_plate || d.full_name)} รับงานจากกลุ่มคนขับ${await samePhoneWarning(d)}`,{offerKey:reference,holderId});
    if (!posted) {
      const committed=await db().prepare("SELECT 1 x FROM booking_assignments WHERE booking_reference=? AND leg='outbound' AND driver_id=? AND revoked_at IS NULL").bind(reference,d.id).first();
      if (!committed) {
        await giveBack();
        await syncDriverOffer(reference).catch(() => undefined);
        return false;
      }
    }
    await bookings.refreshBookingCard(reference).catch(() => undefined);
    await syncDriverOffer(reference).catch(() => undefined);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    console.error("driver take failed", reference, reason);
    const committed=await db().prepare("SELECT 1 x FROM booking_assignments WHERE booking_reference=? AND leg='outbound' AND driver_id=? AND revoked_at IS NULL").bind(reference,d.id).first().catch(() => null);
    if (committed) return true;
    await giveBack().catch(() => undefined);
    await sendTo(telegramChatId(), `⚠️ ${esc(d.full_name)} รับงาน <b>${esc(reference)}</b> ไม่สำเร็จ งานถูกเปิดให้รับใหม่\nสาเหตุ: ${esc(reason.slice(0, 200))}`, undefined, await teamCardMessage(reference)).catch(() => undefined);
    await syncDriverOffer(reference).catch(() => undefined);
    return false;
  }
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
  (await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(driverJobLeg(reference).reference).first<{ telegram_message_id: number }>().catch(() => null))?.telegram_message_id || undefined;

/** The full job (with the customer's details) privately to the driver who took it, if they use Telegram. */
export async function sendJobToLinkedDriver(driverId: string, text: string, eventId = crypto.randomUUID(), assignmentId?:string, attempt=true) {
  if (!driverGroup() && (env as unknown as Record<string,string>).TELEGRAM_DRIVER_UPDATES!=="1") return;
  await ensureTables();
  const { results } = await db().prepare("SELECT telegram_user_id FROM telegram_driver_links WHERE driver_id=?").bind(driverId).all<{ telegram_user_id: string }>();
  for (const r of results) await queueTelegram({id:`${eventId}:${r.telegram_user_id}`,destination:r.telegram_user_id,payload:{text,driverId,assignmentId}},attempt);
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
  const ok = await completeTake(user, form.booking_reference, d, car ? "new_car" : "new_driver");
  await say(chatId, `${car ? "บันทึกข้อมูลรถแล้ว ✓" : "บันทึกข้อมูลคนขับแล้ว ✓"}\n${ok ? `✅ งาน <b>${esc(form.booking_reference)}</b> เป็นของคุณ ใบงานพร้อมข้อมูลลูกค้าและลิงก์งานส่งมาในแชทนี้`
    : "❌ แต่หมดเวลาหรืองานนี้มีคนขับแล้ว"}`);
}

type DocsKind = "new_driver" | "new_car" | "saved";

/**
 * The driver's documents under the booking's card in the team group: licence/ID and car photos from their
 * driver record (private storage → Telegram, never a public link), with their details. Sent for every job
 * taken from the driver group; a driver with no photos on file is flagged instead.
 */
async function postDriverPhotos(reference: string, driverId: string, kind: DocsKind) {
  const d = await db().prepare("SELECT full_name,phone,vehicle,car_plate,id_image_key,id_image_mime,car_image_key,car_image_mime FROM drivers WHERE id=?").bind(driverId)
    .first<{ full_name: string; phone: string; vehicle: string; car_plate: string | null; id_image_key: string | null; id_image_mime: string | null; car_image_key: string | null; car_image_mime: string | null }>();
  if (!d) return;
  const photos:{key:string;mime:string}[]=[],names:string[]=[];
  for (const [key,mime,name] of [[d.id_image_key,d.id_image_mime,"ใบขับขี่/บัตรประชาชน"],[d.car_image_key,d.car_image_mime,kind==='new_car'?"รถ (ใหม่)":"รถ"]] as const) {
    if (key) {photos.push({key,mime:mime||"image/jpeg"});names.push(name);}
  }
  const title = kind === "new_driver" ? "🪪 เอกสารคนขับใหม่" : kind === "new_car" ? "🪪 เอกสารคนขับ (เปลี่ยนรถ)" : "🪪 เอกสารคนขับ";
  const caption = [`${title}: <b>${esc(d.full_name)}</b>`, `เบอร์: ${esc(d.phone)}`, `รถ: ${esc(d.vehicle || "-")}`, `ทะเบียน: ${esc(d.car_plate || "-")}`,
    names.length ? `รูป: ${names.join(", ")}` : "⚠️ ไม่มีรูปเอกสารในระบบ — เพิ่มได้ใน Admin → Drivers", `งาน: ${esc(reference)}`].join("\n");
  const replyTo = await teamCardMessage(reference);
  const identity=driverJobLeg(reference);
  const assignment=await db().prepare("SELECT id FROM booking_assignments WHERE booking_reference=? AND leg=? AND driver_id=? AND revoked_at IS NULL ORDER BY assigned_at DESC LIMIT 1").bind(identity.reference,identity.leg,driverId).first<{id:string}>();
  if (assignment) await queueTelegram({id:`driver-docs:${assignment.id}`,reference:identity.reference,leg:identity.leg,destination:telegramChatId(),payload:{text:caption,photos,replyTo,assignmentId:assignment.id}});

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
  if (!/^[A-Z0-9-]{4,40}$/.test(reference)) return answerCallback(q.id, "ไม่พบงานนี้", true);
  const result = await takeJob(q.from, reference);
  if (!result.ok) return answerCallback(q.id, result.reason, true);
  // The next step happens in their private chat: choose the car (returning driver) or sign up (first time).
  const reached = result.driver ? await askCar(String(q.from.id), reference, result.driver) : await startForm(q.from, String(q.from.id), reference);
  if (reached) return answerCallback(q.id, `✅ ได้งาน ${reference} แล้ว ${result.driver ? "เลือกรถ" : "กรอกข้อมูลคนขับ"}ในแชทส่วนตัวกับบอทภายใน ${SIGNUP_MINUTES} นาที`, true);
  // Never opened the bot: Telegram opens it for them with the link (continues from /start reg_REF).
  const bot = await telegramBotUsername().catch(() => null);
  if (!bot) return answerCallback(q.id, "กดเริ่มแชทกับบอทก่อน", true);
  const link = signupLink(bot, reference);
  await tg("answerCallbackQuery", { callback_query_id: q.id, url: link }).catch(() => undefined);
  // That pop-up is easy to miss or dismiss, so the same link also stays under the job in the group as a button:
  // the driver who took it taps it, starts the chat with the bot and answers there (only they can use it).
  if (q.message) await tg("sendMessage", { chat_id: q.message.chat.id, parse_mode: "HTML", reply_parameters: { message_id: q.message.message_id, allow_sending_without_reply: true },
    text: `✋ <b>${esc(displayName(q.from))}</b> ได้งาน <b>${esc(reference)}</b> แล้ว\nกดปุ่มด้านล่างเพื่อเริ่มแชทกับบอท Waydidi แล้วกรอกข้อมูลภายใน ${SIGNUP_MINUTES} นาที`,
    reply_markup: { inline_keyboard: [[{ text: "▶️ เริ่มแชทกับบอทเพื่อรับงาน", url: link }]] } }).catch(() => undefined);
}

/** Buttons in a driver's private chat (dj_car, dj_x). */
export async function handleDriverCallback(q: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage }) {
  const [action, reference, extra] = (q.data ?? "").split(":");
  const chatId = String(q.message?.chat.id ?? q.from.id);
  if (!reference || !/^[A-Z0-9-]{4,40}$/.test(reference) || !driverGroup()) return answerCallback(q.id, "ไม่พบงานนี้", true);
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
    const ok = await completeTake(q.from, reference, me, "saved");
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
  const bot = await telegramBotUsername().catch(() => null);
  if (isDriverGroupChat(driverGroup(), String(m.chat.id))) await sendTo(String(m.chat.id), sent ? "ส่งรายการงานให้ทางแชทส่วนตัวแล้ว" : `กดเริ่มแชทกับบอทก่อน${bot ? `: https://t.me/${bot}` : ""}`, undefined, m.message_id).catch(() => undefined);
}

/** Reconcile an interruption after dispatch committed but before the offer/documents were updated. */
export async function recoverDriverGroup() {
  if (!driverGroup()) return;
  await ensureTables();
  const rows=(await db().prepare(`SELECT j.booking_reference job_key,j.status,j.holder_telegram_id,a.id assignment_id,a.driver_id,d.full_name
    FROM telegram_driver_jobs j JOIN booking_assignments a ON a.booking_reference=CASE WHEN j.booking_reference LIKE '%--RETURN' THEN substr(j.booking_reference,1,length(j.booking_reference)-8) ELSE j.booking_reference END
      AND a.leg=CASE WHEN j.booking_reference LIKE '%--RETURN' THEN 'return' ELSE 'outbound' END AND a.revoked_at IS NULL
    JOIN drivers d ON d.id=a.driver_id JOIN telegram_driver_links l ON l.driver_id=d.id AND l.telegram_user_id=j.holder_telegram_id
    WHERE j.status IN ('signing_up','taken') ORDER BY a.assigned_at DESC LIMIT 20`).all<{job_key:string;status:string;holder_telegram_id:string;assignment_id:string;driver_id:string;full_name:string}>()).results;
  for (const row of rows) {
    if (row.status==='signing_up') {
      await db().prepare("UPDATE telegram_driver_jobs SET status='taken',driver_id=?,holder_name=?,hold_until=NULL,updated_at=? WHERE booking_reference=? AND status='signing_up' AND holder_telegram_id=?").bind(row.driver_id,row.full_name,now(),row.job_key,row.holder_telegram_id).run();
      await syncDriverOffer(row.job_key);
    }
    await postDriverPhotos(row.job_key,row.driver_id,'saved');
  }
}

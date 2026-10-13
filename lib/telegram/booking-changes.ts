import { requestCancellation } from "@/lib/cancellation-requests";
import { quoteRefund } from "@/lib/refunds";
import { queueTelegram } from "./outbox";
import { ensureReliabilityTables, reliabilityDb } from "./reliability-db";
import { assignDriver } from "@/lib/assignment-service";
import { deliverAssignmentTelegram } from "./assignments";
import { applyBookingChange } from "../booking-change";
import { env } from "cloudflare:workers";
import { fullName as personName } from "@/lib/person-name";
import { VEHICLES } from "@/lib/vehicles";
import { esc } from "./cards";
import { editCard, sendCard, telegramChatId, telegramConfigured } from "./client";
import { askBookingQuestion, postAssignmentWhenReady } from "./booking-tasks";
import { paymentLabelThai } from "@/lib/payment-methods";

// Cancellation and journey-change requests on Telegram. Each request gets one card in the group
// with buttons; the outcome edits the card, and a driver who already has the job is told in Thai.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const now = () => new Date().toISOString();
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");
const carName = (v: string) => (VEHICLES as Record<string, { name: string }>)[v]?.name ?? v;

type Booking = { reference: string; customer_name: string; customer_surname: string | null; customer_phone: string | null; pickup: string; dropoff: string; pickup_date: string; pickup_time: string;
  vehicle: string; total: number; payment_method: string; payment_status: string; status: string };
const booking = (ref: string) => db().prepare("SELECT reference,customer_name,customer_surname,customer_phone,pickup,dropoff,pickup_date,pickup_time,vehicle,total,payment_method,payment_status,status FROM bookings WHERE reference=?").bind(ref).first<Booking>();
const fullName = (b: Booking) => personName(b.customer_name, b.customer_surname);
const trip = (b: { pickup_date: string; pickup_time: string; pickup: string; dropoff: string; vehicle: string }) => `${ddmmyyyy(b.pickup_date)} ${b.pickup_time} · ${b.pickup} → ${b.dropoff} · ${carName(b.vehicle)}`;

/** Claims a request card once; false when it was already posted. */
async function claim(id: string, ref: string, kind: string) {
  const r = await db().prepare("INSERT INTO telegram_request_cards(id,booking_reference,kind,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id, ref, kind, now()).run();
  return r.meta.changes > 0;
}
async function post(id:string,text:string,keyboard:{text:string;callback_data:string}[][]) {
  return queueTelegram({id:`request-card:${id}`,destination:telegramChatId(),payload:{text,keyboard,target:{kind:"request_card",id}}});
}
async function close(id: string, text: string) {
  const card = await db().prepare("UPDATE telegram_request_cards SET status='done' WHERE id=? AND status='open'").bind(id).run();
  if (!card.meta.changes) return false;
  const row = await db().prepare("SELECT telegram_message_id FROM telegram_request_cards WHERE id=?").bind(id).first<{ telegram_message_id: number }>();
  if (row?.telegram_message_id) await editCard(row.telegram_message_id, text, []).catch(() => undefined);
  return true;
}
/** Driver already has the job (Thai job post was sent). */
const jobMessageId = (ref: string) => db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=? AND assignment_posted=1").bind(ref).first<{ telegram_message_id: number }>();

// ---------- Cancellation ----------

async function cancelText(b: Booking, extra = "", requestedAt=now()) {
  const h=(new Date(`${b.pickup_date}T${b.pickup_time}:00+07:00`).getTime()-Date.parse(requestedAt))/3600_000;
  const entitlement=await quoteRefund(b.reference,"customer_cancellation",requestedAt);
  const refund="error" in entitlement ? "ต้องตรวจสอบเงื่อนไขเดิมก่อนคืนเงิน" : `${entitlement.percent}% · THB ${(entitlement.amountMinor/100).toLocaleString("en-US")} · ${esc(entitlement.policyVersion)}`;
  return [`<b>คำขอยกเลิกการจอง ${esc(b.reference)}</b>`, "",
    `ลูกค้า: ${esc(fullName(b))}${b.customer_phone ? ` · ${esc(b.customer_phone)}` : ""}`,
    `การเดินทาง: ${esc(trip(b))}`,
    `ยอดจอง: ${thb(b.total)} (${b.payment_method === "transfer" || b.payment_method === "cash" ? paymentLabelThai(b.payment_method, b.payment_status) : "ชำระออนไลน์แล้ว"})`,
    `ระยะเวลาก่อนรับ ณ เวลาขอยกเลิก: ${Math.max(0,Math.floor(h))} ชม.`,
    `สิทธิคืนเงิน: ${refund}`,
    extra].filter((l) => l !== "").join("\n");
}

/** The customer asked to cancel (from the manage-booking page). Posted once per booking. */
export async function notifyCancellationRequest(reference:string) {
  const b=await booking(reference);
  if (!b || b.status!=="confirmed") return false;
  const request=await requestCancellation(reference);
  if (!request) return false;
  const id=`cancel:${request.id}`;
  const fresh=await claim(id,reference,"cancel");
  await post(id,await cancelText(b,"",request.requested_at),[[{text:"Cancel booking",callback_data:`bk_cancel:${reference}:${request.id}`},{text:"Keep booking",callback_data:`bk_keep:${reference}:${request.id}`}]]);
  return fresh;
}

/** Cancels the booking, revokes the driver's link and tells the driver. */
export async function cancelBookingFromTelegram(reference:string,by:string,requestId?:string) {
  await ensureReliabilityTables();
  const b=await booking(reference);
  if (!b) return "Booking not found.";
  const request=await reliabilityDb().prepare("SELECT id,requested_at FROM booking_cancellation_requests WHERE booking_reference=? AND status='pending'").bind(reference).first<{id:string;requested_at:string}>();
  if (request && !requestId) return "Open the latest cancellation request card before confirming.";
  if (requestId && request?.id!==requestId) return "This cancellation request was already handled.";
  if (b.status==="cancelled") {await announceCancelled(b,by);return "Already cancelled.";}
  if (b.status!=="confirmed") return "This booking cannot be cancelled from Telegram.";
  const at=now();
  const [done]=await reliabilityDb().batch([
    reliabilityDb().prepare("UPDATE bookings SET status='cancelled',cancelled_at=?,booking_version=booking_version+1,updated_at=? WHERE reference=? AND status='confirmed'").bind(at,at,reference),
    reliabilityDb().prepare("UPDATE booking_assignments SET revoked_at=?,updated_at=? WHERE booking_reference=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND status='cancelled')").bind(at,at,reference,reference),
    reliabilityDb().prepare("UPDATE booking_cancellation_requests SET status='approved',resolved_at=? WHERE booking_reference=? AND status='pending'").bind(at,reference),
    reliabilityDb().prepare("DELETE FROM telegram_booking_prompts WHERE booking_reference=?").bind(reference),
    reliabilityDb().prepare("UPDATE dispatch_revision SET version=version+1 WHERE id=1"),
  ]);
  if (!done.meta.changes) return "Already handled.";
  if (request) await close(`cancel:${request.id}`,await cancelText(b,`\nยกเลิกแล้ว โดย ${esc(by)}`,request.requested_at));
  await announceCancelled({...b,status:"cancelled"},by);
  await import("./bookings").then(m=>m.refreshBookingCard(reference));
  return "Booking cancelled.";
}

/** Durable team notice, plus optional linked-driver notices for each independently assigned leg. */
export async function announceCancelled(b:Booking,by:string) {
  const job=await jobMessageId(b.reference);
  const text=[`<b>ยกเลิกงาน ${esc(b.reference)}</b>`,"",`ลูกค้า: ${esc(fullName(b))}`,`การเดินทาง: ${esc(trip(b))}`,"",job?"คนขับไม่ต้องไปรับ ลิงก์งานเดิมใช้ไม่ได้แล้ว":"ยังไม่ได้มอบหมายคนขับ",`ยกเลิกโดย: ${esc(by)}`].join("\n");
  const event=await reliabilityDb().prepare("SELECT cancelled_at,binned_at FROM bookings WHERE reference=?").bind(b.reference).first<{cancelled_at:string|null;binned_at:string|null}>();
  const key=`cancelled:${b.reference}:${event?.cancelled_at??event?.binned_at??"legacy"}`;
  await queueTelegram({id:`${key}:team`,reference:b.reference,destination:telegramChatId(),payload:{text,replyTo:job?.telegram_message_id||undefined}});
  if ((env as unknown as Record<string,string>).TELEGRAM_DRIVER_UPDATES==="1") {
    const rows=(await reliabilityDb().prepare("SELECT DISTINCT a.driver_id,a.leg,l.telegram_user_id FROM booking_assignments a JOIN telegram_driver_links l ON l.driver_id=a.driver_id WHERE a.booking_reference=?").bind(b.reference).all<{driver_id:string;leg:string;telegram_user_id:string}>()).results;
    for (const row of rows) await queueTelegram({id:`${key}:${row.leg}:${row.telegram_user_id}`,reference:b.reference,leg:row.leg,destination:row.telegram_user_id,payload:{text:`ยกเลิกงาน ${esc(b.reference)} (${row.leg==='return'?'ขากลับ':'ขาไป'}) — ไม่ต้องไปรับ ลิงก์งานเดิมใช้ไม่ได้แล้ว`,driverId:row.driver_id}});
  }
}

export async function keepBooking(reference:string,by:string,requestId?:string) {
  await ensureReliabilityTables();
  const request=await reliabilityDb().prepare("SELECT id,requested_at FROM booking_cancellation_requests WHERE booking_reference=? AND status='pending'").bind(reference).first<{id:string;requested_at:string}>();
  if (!request || !requestId || requestId!==request.id) return "Already handled.";
  const b=await booking(reference);
  if (!b) return "Booking not found.";
  const done=await reliabilityDb().prepare("UPDATE booking_cancellation_requests SET status='kept',resolved_at=? WHERE id=? AND status='pending'").bind(now(),request.id).run();
  if (!done.meta.changes) return "Already handled.";
  await close(`cancel:${request.id}`,await cancelText(b,`\nไม่ยกเลิก โดย ${esc(by)} · แจ้งลูกค้าด้วย`,request.requested_at));
  return "Booking kept. Let the customer know.";
}

/** Admin moved a booking to the bin / restored it in the admin panel. */
export async function notifyAdminBinned(reference: string, by: string) {
  if (!telegramConfigured()) return;
  const b = await booking(reference);
  if (b) await announceCancelled(b, `${by} (ย้ายไปถังขยะในระบบแอดมิน)`);
}
export async function notifyAdminRestored(reference: string, by: string) {
  if (!telegramConfigured()) return;
  const b = await booking(reference);
  if (b) await sendCard([`<b>กู้คืนการจอง ${esc(reference)}</b>`, "", `ลูกค้า: ${esc(fullName(b))}`, `การเดินทาง: ${esc(trip(b))}`, "", "ต้องมอบหมายคนขับใหม่ (ลิงก์งานเดิมถูกยกเลิกแล้ว)", `กู้คืนโดย: ${esc(by)}`].join("\n"));
}

// ---------- Journey change ----------

type Change = { id: string; booking_reference: string; status: string; pickup: string; dropoff: string; pickup_date: string; pickup_time: string; vehicle_id: string;
  original_total: number; revised_total: number; price_difference: number; reason: string | null; booking_version: number };
const change = (id: string) => db().prepare("SELECT * FROM booking_change_requests WHERE id=?").bind(id).first<Change>();

function changeText(b: Booking, c: Change, extra = "") {
  const diff = c.price_difference;
  return [`<b>คำขอเปลี่ยนแปลงการจอง ${esc(b.reference)}</b>`, "",
    `ลูกค้า: ${esc(fullName(b))}${b.customer_phone ? ` · ${esc(b.customer_phone)}` : ""}`, "",
    `เดิม: ${esc(trip(b))} · ${thb(c.original_total)}`,
    `ใหม่: ${esc(trip({ pickup_date: c.pickup_date, pickup_time: c.pickup_time, pickup: c.pickup, dropoff: c.dropoff, vehicle: c.vehicle_id }))} · ${thb(c.revised_total)}`,
    `ส่วนต่างราคา: ${diff === 0 ? "ไม่มี" : `${diff > 0 ? "+" : "-"}${thb(Math.abs(diff))} (${diff > 0 ? "เก็บเพิ่มจากลูกค้า" : "คืนเงินลูกค้า"})`}`,
    `เหตุผล: ${esc(c.reason || "-")}`,
    extra].filter((l) => l !== "").join("\n");
}

export async function notifyChangeRequest(id: string) {
  const c = await change(id);
  const b = c && await booking(c.booking_reference);
  if (!c || !b) return false;
  const fresh=await claim(`chg:${id}`,c.booking_reference,"change");
  await post(`chg:${id}`, changeText(b, c), [[{ text: "Approve change", callback_data: `chg_ok:${id}` }, { text: "Decline", callback_data: `chg_no:${id}` }]]);
  return fresh;
}

/** Applies the new journey to the booking; a driver who had the job gets an updated job post. */
export async function approveChange(id: string, by: string) {
  const c = await change(id);
  const b = c && await booking(c.booking_reference);
  if (!c || !b) return "Request not found.";
  if (c.status !== "pending") return "Already handled.";
  const at = now();
  const result = await applyBookingChange(id, at);
  if (result === "handled") return "Already handled.";
  if (result === "invalid") {
    await db().prepare("UPDATE booking_change_requests SET status='expired',resolved_at=? WHERE id=? AND status='pending'").bind(at, id).run();
    await close(`chg:${id}`, changeText(b, c, "The revised journey is incomplete or its return time is invalid."));
    return "The revised journey is incomplete or its return time is invalid. Ask the customer to send it again.";
  }
  if (result === "stale") {
    await db().prepare("UPDATE booking_change_requests SET status='expired',resolved_at=? WHERE id=? AND status='pending'").bind(at, id).run();
    await close(`chg:${id}`, changeText(b, c, "\nใช้ไม่ได้: การจองถูกแก้ไขหรือยกเลิกไปแล้ว"));
    return "The booking changed since this request; ask the customer to send it again.";
  }
  await close(`chg:${id}`, changeText(b, c, `\nอนุมัติแล้ว โดย ${esc(by)}${c.price_difference ? ` · ${c.price_difference > 0 ? "เก็บเงินเพิ่ม" : "คืนเงิน"} ${thb(Math.abs(c.price_difference))}` : ""}`));
  // A driver who has the job: the Admin group chooses what happens next (see notifyBookingEdited).
  await notifyBookingEdited(b.reference, by, "ลูกค้าเปลี่ยนการเดินทาง");
  return "Change approved.";
}

export async function declineChange(id: string, by: string) {
  const c = await change(id);
  const b = c && await booking(c.booking_reference);
  if (!c || !b) return "Request not found.";
  const r = await db().prepare("UPDATE booking_change_requests SET status='declined',resolved_at=? WHERE id=? AND status='pending'").bind(now(), id).run();
  if (!r.meta.changes) return "Already handled.";
  await close(`chg:${id}`, changeText(b, c, `\nไม่อนุมัติ โดย ${esc(by)} · แจ้งลูกค้าด้วย`));
  return "Change declined. Let the customer know.";
}

/** After a booking's details change: a driver who has the job gets a new job post (new link), and the card is redrawn. */
export async function republishJob(reference:string,by:string,note="") {
  await ensureReliabilityTables();
  const assignments=(await reliabilityDb().prepare("SELECT id,driver_id,leg FROM booking_assignments WHERE booking_reference=? AND revoked_at IS NULL").bind(reference).all<{id:string;driver_id:string;leg:"outbound"|"return"}>()).results;
  const version=await reliabilityDb().prepare("SELECT booking_version FROM bookings WHERE reference=?").bind(reference).first<{booking_version:number}>();
  for (const a of assignments) {
    const previous=await reliabilityDb().prepare("SELECT driver_dm FROM telegram_assignment_messages WHERE assignment_id=?").bind(a.id).first<{driver_dm:number}>();
    const message=await jobMessageId(reference);
    const committed=await assignDriver({reference,leg:a.leg,driverId:a.driver_id,by,telegramHeader:`<b>แก้ไขงาน ${esc(reference)}</b> (${a.leg==='return'?'ขากลับ':'ขาไป'}) — ลิงก์งานเดิมใช้ไม่ได้แล้ว${note?` · ${esc(note)}`:''}`,telegramDriverDm:Boolean(previous?.driver_dm),telegramReplyTo:message?.telegram_message_id||undefined,expectedAssignmentId:a.id,expectedVersion:version?.booking_version,idempotencyKey:`change:${reference}:${a.leg}:${version?.booking_version}:${a.id}`});
    if (!committed.ok) {
      const at=now();
      await reliabilityDb().batch([
        reliabilityDb().prepare("UPDATE booking_assignments SET revoked_at=?,updated_at=? WHERE id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND booking_version=?)").bind(at,at,a.id,reference,version?.booking_version??-1),
        reliabilityDb().prepare("UPDATE bookings SET attention_status='attention',attention_reason='Journey changed; driver schedule needs review',updated_at=? WHERE reference=? AND booking_version=?").bind(at,reference,version?.booking_version??-1),
      ]);
      // A changed schedule that conflicts with another job requires dispatch review, never a hidden override.
      await queueTelegram({id:`change-conflict:${reference}:${a.leg}:${version?.booking_version}`,reference,leg:a.leg,destination:telegramChatId(),payload:{text:`⚠️ แก้ไขงาน ${esc(reference)} (${a.leg}) — ${esc(committed.error)} กรุณาตรวจสอบใน Admin`}});
      continue;
    }
    await deliverAssignmentTelegram(committed.assignment.id);
  }
  await import("./bookings").then(m=>m.refreshBookingCard(reference));
}

// ---------- A booking that already has a driver was edited ----------
// The driver is not told automatically. The Admin group gets an "edited booking" card: «Assign to me», then two
// choices: «คนขับปัจจุบัน» sends the updated ใบงาน to the driver who has the job; «คนขับใหม่» takes the job away
// from that driver, asks for a new driver cost in the Admin group and offers the job to the driver group again.

const editKeyboard = (id: string, step: "open" | "ack") => step === "open"
  ? [[{ text: "Assign to me", callback_data: `edit_ack:${id}` }]]
  : [[{ text: "คนขับปัจจุบัน", callback_data: `edit_cur:${id}` }, { text: "คนขับใหม่", callback_data: `edit_new:${id}` }]];

type EditDriver = { driver_id: string; full_name: string; phone: string | null; car_plate: string | null; vehicle: string | null };
const currentDriver = (ref: string) => db().prepare(`SELECT a.driver_id,d.full_name,d.phone,d.car_plate,d.vehicle FROM booking_assignments a JOIN drivers d ON d.id=a.driver_id
  WHERE a.booking_reference=? AND a.leg='outbound' AND a.revoked_at IS NULL`).bind(ref).first<EditDriver>();

function editText(b: Booking, d: EditDriver | null, note: string, extra = "") {
  return [`<b>แก้ไขการจอง ${esc(b.reference)}</b>${note ? ` · ${esc(note)}` : ""}`, "",
    `ลูกค้า: ${esc(fullName(b))}${b.customer_phone ? ` · ${esc(b.customer_phone)}` : ""}`,
    `การเดินทาง: ${esc(trip(b))}`,
    `ยอดจอง: ${thb(b.total)} (${b.payment_method === "transfer" || b.payment_method === "cash" ? paymentLabelThai(b.payment_method, b.payment_status) : "ชำระออนไลน์แล้ว"})`, "",
    d ? `คนขับปัจจุบัน: ${esc(d.full_name)}${d.car_plate ? ` · ${esc(d.car_plate)}` : ""}${d.phone ? ` · ${esc(d.phone)}` : ""}` : "คนขับปัจจุบัน: -",
    extra].filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n").trim();
}

/**
 * A booking was edited (Admin, a payment change, or an approved customer change). With no driver on it the card is
 * just redrawn (an offer still in the driver group updates itself). With a driver, the Admin group gets the
 * "edited booking" card above; an older, unanswered edit card for the same booking is replaced by this one.
 */
export async function notifyBookingEdited(reference: string, by: string, note = "") {
  if (!telegramConfigured()) return;
  const refresh = () => import("./bookings").then((m) => m.refreshBookingCard(reference)).catch(() => undefined);
  const b = await booking(reference);
  if (!b || b.status === "cancelled" || !await jobMessageId(reference)) { await refresh(); return; }
  // Replace an edit card nobody finished.
  const { results: older } = await db().prepare("SELECT telegram_message_id FROM telegram_request_cards WHERE booking_reference=? AND kind='edit' AND status IN ('open','ack')").bind(reference).all<{ telegram_message_id: number }>();
  if (older.length) {
    await db().prepare("UPDATE telegram_request_cards SET status='done' WHERE booking_reference=? AND kind='edit' AND status IN ('open','ack')").bind(reference).run();
    for (const r of older) if (r.telegram_message_id) await editCard(r.telegram_message_id, `<b>แก้ไขการจอง ${esc(reference)}</b>\nถูกแทนที่ด้วยการแก้ไขล่าสุดด้านล่าง`, []).catch(() => undefined);
  }
  const id = `${reference}-${Date.now().toString(36)}`;
  if (!await claim(id, reference, "edit")) return;
  await post(id, editText(b, await currentDriver(reference), note, `แก้ไขโดย: ${esc(by)}`), editKeyboard(id, "open"));
  await refresh();
}

type EditCard = { id: string; booking_reference: string; telegram_message_id: number };
const editCardRow = (id: string) => db().prepare("SELECT id,booking_reference,telegram_message_id FROM telegram_request_cards WHERE id=? AND kind='edit'").bind(id).first<EditCard>();
/** Moves an edit card from one step to the next once (two people tapping at once: one wins). */
async function step(id: string, from: "open" | "ack", to: "ack" | "done") {
  return (await db().prepare("UPDATE telegram_request_cards SET status=? WHERE id=? AND kind='edit' AND status=?").bind(to, id, from).run()).meta.changes > 0;
}
async function showEdit(card: EditCard, text: string, keyboard: { text: string; callback_data: string }[][]) {
  if (card.telegram_message_id) await editCard(card.telegram_message_id, text, keyboard).catch(() => undefined);
}

/** «Assign to me» on the edited-booking card: shows the two choices. */
export async function acknowledgeEdit(id: string, by: string) {
  const card = await editCardRow(id);
  const b = card && await booking(card.booking_reference);
  if (!card || !b) return "Request not found.";
  if (!await step(id, "open", "ack")) return "Someone already took this.";
  await showEdit(card, editText(b, await currentDriver(b.reference), "", `รับเรื่องโดย: ${esc(by)}\nเลือก: คนขับปัจจุบัน หรือ คนขับใหม่`), editKeyboard(id, "ack"));
  return "It's yours. Choose the current driver or a new driver.";
}

/** «คนขับปัจจุบัน»: the driver who has the job gets the updated ใบงาน (new link; the old one stops working). */
export async function editKeepDriver(id: string, by: string) {
  const card = await editCardRow(id);
  const b = card && await booking(card.booking_reference);
  if (!card || !b) return "Request not found.";
  if (!await step(id, "ack", "done")) return "Already handled.";
  const d = await currentDriver(b.reference);
  if (!d) {
    await showEdit(card, editText(b, null, "", `ไม่มีคนขับแล้ว · ปิดโดย ${esc(by)}`), []);
    await import("./bookings").then((m) => m.refreshBookingCard(b.reference)).catch(() => undefined);
    return "That job has no driver any more.";
  }
  await republishJob(b.reference, by, "แก้ไขโดยแอดมิน");
  await showEdit(card, editText(b, d, "", `ส่งใบงานที่แก้ไขให้คนขับปัจจุบันแล้ว · โดย ${esc(by)}`), []);
  return "Updated job sent to the current driver.";
}

/**
 * «คนขับใหม่»: the current driver loses the job (their link stops working and they are told), the job is
 * taken out of the driver group, and the Admin group is asked for a new driver cost. Once it is set the
 * job is offered to the driver group again, as for a new booking.
 */
export async function editNewDriver(id: string, by: string, asker: { id: number; first_name?: string }) {
  const card = await editCardRow(id);
  const b = card && await booking(card.booking_reference);
  if (!card || !b) return "Request not found.";
  if (!await step(id, "ack", "done")) return "Already handled.";
  const d = await currentDriver(b.reference);
  const at = now();
  await db().prepare("UPDATE booking_assignments SET revoked_at=?,updated_at=? WHERE booking_reference=? AND leg='outbound' AND revoked_at IS NULL").bind(at, at, b.reference).run();
  await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=NULL,driver_done=0,assignment_posted=0,cost_done=0 WHERE booking_reference=?").bind(b.reference).run();
  // The old cost goes (unless it was already paid), so the job is not offered again until the new cost is set.
  const oldCost = await db().prepare("SELECT total_driver_cost AS cost FROM booking_costs WHERE booking_reference=? AND payment_status<>'paid'").bind(b.reference).first<{ cost: number | null }>();
  await db().prepare("UPDATE booking_costs SET agreed_driver_cost=0,additional_costs=0,total_driver_cost=0,updated_by=?,updated_at=? WHERE booking_reference=? AND payment_status<>'paid'").bind(`telegram:${by}`, at, b.reference).run();
  const driverGroup = await import("./driver-group");
  await driverGroup.withdrawDriverOffer(b.reference).catch((error) => console.error("driver offer withdraw failed", error instanceof Error ? error.message : "unknown"));
  if (d) await driverGroup.sendJobToLinkedDriver(d.driver_id, `⚠️ <b>งาน ${esc(b.reference)}</b> มีการแก้ไขและเปลี่ยนคนขับ ลิงก์งานเดิมใช้ไม่ได้แล้ว ไม่ต้องไปรับงานนี้`).catch(() => undefined);
  await showEdit(card, editText(b, d, "", `คนขับใหม่ · โดย ${esc(by)}${oldCost?.cost ? `\nราคาค่างานเดิม: ${oldCost.cost.toLocaleString("en-US")} บาท` : ""}\nกำลังตั้งราคาค่างานใหม่ แล้วจะส่งงานให้กลุ่มคนขับอีกครั้ง`), []);
  await import("./bookings").then((m) => m.refreshBookingCard(b.reference)).catch(() => undefined);
  await askBookingQuestion(b.reference, "cost", asker);
  return "Type the new driver cost. The job is offered to the drivers again after that.";
}

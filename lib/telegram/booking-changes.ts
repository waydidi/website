import { env } from "cloudflare:workers";
import { VEHICLES } from "@/lib/vehicles";
import { esc } from "./cards";
import { editCard, sendCard, telegramConfigured } from "./client";
import { postAssignmentWhenReady } from "./booking-tasks";

// Cancellation and journey-change requests on Telegram. Each request gets one card in the group
// with buttons; the outcome edits the card, and a driver who already has the job is told in Thai.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const now = () => new Date().toISOString();
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");
const carName = (v: string) => (VEHICLES as Record<string, { name: string }>)[v]?.name ?? v;

type Booking = { reference: string; customer_name: string; customer_surname: string | null; customer_phone: string | null; pickup: string; dropoff: string; pickup_date: string; pickup_time: string;
  vehicle: string; total: number; payment_method: string; status: string };
const booking = (ref: string) => db().prepare("SELECT reference,customer_name,customer_surname,customer_phone,pickup,dropoff,pickup_date,pickup_time,vehicle,total,payment_method,status FROM bookings WHERE reference=?").bind(ref).first<Booking>();
const fullName = (b: Booking) => `${b.customer_name} ${b.customer_surname ?? ""}`.trim();
const trip = (b: { pickup_date: string; pickup_time: string; pickup: string; dropoff: string; vehicle: string }) => `${ddmmyyyy(b.pickup_date)} ${b.pickup_time} · ${b.pickup} → ${b.dropoff} · ${carName(b.vehicle)}`;
const hoursUntil = (b: Booking) => (new Date(`${b.pickup_date}T${b.pickup_time}:00+07:00`).getTime() - Date.now()) / 3600_000;

/** Claims a request card once; false when it was already posted. */
async function claim(id: string, ref: string, kind: string) {
  const r = await db().prepare("INSERT INTO telegram_request_cards(id,booking_reference,kind,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id, ref, kind, now()).run();
  return r.meta.changes > 0;
}
async function post(id: string, text: string, keyboard: { text: string; callback_data: string }[][]) {
  try {
    const sent = await sendCard(text, keyboard);
    await db().prepare("UPDATE telegram_request_cards SET telegram_message_id=? WHERE id=?").bind(sent.message_id, id).run();
  } catch (error) { await db().prepare("DELETE FROM telegram_request_cards WHERE id=? AND telegram_message_id=0").bind(id).run(); throw error; }
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

function cancelText(b: Booking, extra = "") {
  const h = hoursUntil(b);
  return [`<b>คำขอยกเลิกการจอง ${esc(b.reference)}</b>`, "",
    `ลูกค้า: ${esc(fullName(b))}${b.customer_phone ? ` · ${esc(b.customer_phone)}` : ""}`,
    `การเดินทาง: ${esc(trip(b))}`,
    `ยอดจอง: ${thb(b.total)} (${b.payment_method === "cash" ? "เงินสดวันเดินทาง" : "ชำระออนไลน์แล้ว"})`,
    `เหลือเวลาก่อนรับ: ${h >= 24 ? `${Math.floor(h / 24)} วัน ${Math.floor(h % 24)} ชม. (ยกเลิกได้คืนเงิน)` : `${Math.max(0, Math.floor(h))} ชม. (น้อยกว่า 24 ชม. ไม่คืนเงิน)`}`,
    extra].filter((l) => l !== "").join("\n");
}

/** The customer asked to cancel (from the manage-booking page). Posted once per booking. */
export async function notifyCancellationRequest(reference: string) {
  if (!telegramConfigured()) return false;
  const b = await booking(reference);
  if (!b || b.status === "cancelled") return false;
  const id = `cancel:${reference}`;
  if (!await claim(id, reference, "cancel")) return false;
  await post(id, cancelText(b), [[{ text: "Cancel booking", callback_data: `bk_cancel:${reference}` }, { text: "Keep booking", callback_data: `bk_keep:${reference}` }]]);
  return true;
}

/** Cancels the booking, revokes the driver's link and tells the driver. */
export async function cancelBookingFromTelegram(reference: string, by: string) {
  const b = await booking(reference);
  if (!b) return "Booking not found.";
  const at = now();
  const done = await db().prepare("UPDATE bookings SET status='cancelled',cancelled_at=?,updated_at=? WHERE reference=? AND status NOT IN ('cancelled','binned')").bind(at, at, reference).run();
  if (!done.meta.changes) { await close(`cancel:${reference}`, cancelText(b, `\nสถานะ: ปิดแล้ว (${esc(b.status)})`)); return "Already cancelled."; }
  await db().prepare("UPDATE booking_assignments SET revoked_at=?,updated_at=? WHERE booking_reference=? AND revoked_at IS NULL").bind(at, at, reference).run();
  await close(`cancel:${reference}`, cancelText(b, `\nยกเลิกแล้ว โดย ${esc(by)}`));
  await announceCancelled(b, by);
  return "Booking cancelled.";
}

/** Thai notice in the group, as a reply to the job post when a driver has it. */
export async function announceCancelled(b: Booking, by: string) {
  const job = await jobMessageId(b.reference);
  await sendCard([`<b>ยกเลิกงาน ${esc(b.reference)}</b>`, "",
    `ลูกค้า: ${esc(fullName(b))}`, `การเดินทาง: ${esc(trip(b))}`, "",
    job ? "คนขับไม่ต้องไปรับ ลิงก์งานเดิมใช้ไม่ได้แล้ว" : "ยังไม่ได้มอบหมายคนขับ",
    `ยกเลิกโดย: ${esc(by)}`].join("\n"), undefined, job?.telegram_message_id || undefined);
}

export async function keepBooking(reference: string, by: string) {
  const b = await booking(reference);
  if (!b) return "Booking not found.";
  return await close(`cancel:${reference}`, cancelText(b, `\nไม่ยกเลิก (เก็บการจองไว้) โดย ${esc(by)} · แจ้งลูกค้าด้วย`)) ? "Booking kept. Let the customer know." : "Already handled.";
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
  if (!telegramConfigured()) return false;
  const c = await change(id);
  const b = c && await booking(c.booking_reference);
  if (!c || !b || !await claim(`chg:${id}`, c.booking_reference, "change")) return false;
  await post(`chg:${id}`, changeText(b, c), [[{ text: "Approve change", callback_data: `chg_ok:${id}` }, { text: "Decline", callback_data: `chg_no:${id}` }]]);
  return true;
}

/** Applies the new journey to the booking; a driver who had the job gets an updated job post. */
export async function approveChange(id: string, by: string) {
  const c = await change(id);
  const b = c && await booking(c.booking_reference);
  if (!c || !b) return "Request not found.";
  if (c.status !== "pending") return "Already handled.";
  const at = now();
  const updated = await db().prepare("UPDATE bookings SET pickup=?,dropoff=?,pickup_date=?,pickup_time=?,vehicle=?,total=?,booking_version=booking_version+1,updated_at=? WHERE reference=? AND booking_version=? AND status NOT IN ('cancelled','binned')")
    .bind(c.pickup, c.dropoff, c.pickup_date, c.pickup_time, c.vehicle_id, c.revised_total, at, b.reference, c.booking_version).run();
  if (!updated.meta.changes) {
    await db().prepare("UPDATE booking_change_requests SET status='expired',resolved_at=? WHERE id=?").bind(at, id).run();
    await close(`chg:${id}`, changeText(b, c, "\nใช้ไม่ได้: การจองถูกแก้ไขหรือยกเลิกไปแล้ว"));
    return "The booking changed since this request; ask the customer to send it again.";
  }
  await db().prepare("UPDATE booking_change_requests SET status='approved',resolved_at=? WHERE id=?").bind(at, id).run();
  await close(`chg:${id}`, changeText(b, c, `\nอนุมัติแล้ว โดย ${esc(by)}${c.price_difference ? ` · ${c.price_difference > 0 ? "เก็บเงินเพิ่ม" : "คืนเงิน"} ${thb(Math.abs(c.price_difference))}` : ""}`));
  // The driver gets a fresh job post (new link; the old one stops working).
  if (await jobMessageId(b.reference)) {
    await db().prepare("UPDATE telegram_booking_cards SET assignment_posted=0 WHERE booking_reference=?").bind(b.reference).run();
    await postAssignmentWhenReady(b.reference, by, `<b>แก้ไขงาน ${esc(b.reference)}</b> (ข้อมูลใหม่ ลิงก์เดิมใช้ไม่ได้แล้ว)`);
  }
  await import("./bookings").then((m) => m.refreshBookingCard(b.reference)).catch(() => undefined);
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

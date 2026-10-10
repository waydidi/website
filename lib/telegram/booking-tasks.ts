import { env } from "cloudflare:workers";
import { fullName } from "@/lib/person-name";
import { sha256 } from "@/lib/security";
import { driverTokenForAssignment } from "@/lib/trip-links";
import { SITE_URL } from "@/lib/site";
import { jobVehicleName } from "./job-text";
import { esc } from "./cards";
import { sendCard, telegramChatId, tg, type TelegramMessage } from "./client";

// After a booking is taken in the Telegram group: "Set cost" and "Add driver information" ask
// their questions one at a time (Telegram's reply box opens for the person who tapped). When both
// are done, the job is posted to the group in Thai with one link for trip and driver status.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const now = () => new Date().toISOString();

type Field = "cost" | "driver_name" | "driver_phone" | "driver_plate" | "driver_model" | "driver_license";
const DRIVER_STEPS: Field[] = ["driver_name", "driver_phone", "driver_plate", "driver_model", "driver_license"];
const QUESTION: Record<Field, string> = {
  cost: "Driver cost in THB (numbers only)",
  driver_name: "Driver full name",
  driver_phone: "Driver phone number",
  driver_plate: "Car plate",
  driver_model: "Car model (e.g. Toyota Camry, black)",
  driver_license: "Driving licence number",
};
type DriverForm = { name?: string; phone?: string; plate?: string; model?: string; license?: string; driverId?: string };

/** Asks one question in the group; only the person who tapped gets the reply box. */
export async function askBookingQuestion(reference: string, field: Field, user: { id: number; first_name?: string }) {
  const mention = `<a href="tg://user?id=${user.id}">${esc(user.first_name ?? "You")}</a>`;
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>();
  const step = field === "cost" ? "" : ` (${DRIVER_STEPS.indexOf(field) + 1}/${DRIVER_STEPS.length})`;
  const sent = await tg<TelegramMessage>("sendMessage", { chat_id: telegramChatId(), parse_mode: "HTML",
    text: `${mention}, booking <b>${esc(reference)}</b>${step}: ${QUESTION[field]}?`,
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: QUESTION[field] },
    ...(card?.telegram_message_id ? { reply_parameters: { message_id: card.telegram_message_id, allow_sending_without_reply: true } } : {}) });
  await db().prepare("INSERT OR REPLACE INTO telegram_booking_prompts(telegram_message_id,booking_reference,field,telegram_user_id,created_at) VALUES(?,?,?,?,?)")
    .bind(sent.message_id, reference, field, String(user.id), now()).run();
}

/**
 * An answer in the group: a reply to a question, or the next plain message from the person who
 * was asked (within 10 minutes). Returns true when it was a booking answer.
 */
export async function handleBookingAnswer(m: TelegramMessage, adminName: string, refresh: (reference: string) => Promise<unknown>) {
  const text = (m.text ?? "").trim();
  if (!text || !m.from) return false;
  let prompt = m.reply_to_message
    ? await db().prepare("SELECT * FROM telegram_booking_prompts WHERE telegram_message_id=?").bind(m.reply_to_message.message_id).first<{ telegram_message_id: number; booking_reference: string; field: Field; telegram_user_id: string | null }>()
    : null;
  if (!prompt && !m.reply_to_message) prompt = await db().prepare("SELECT * FROM telegram_booking_prompts WHERE telegram_user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1")
    .bind(String(m.from.id), new Date(Date.now() - 10 * 60_000).toISOString()).first();
  if (!prompt) return false;
  const ref = prompt.booking_reference;
  const again = async (note: string) => { await sendCard(`${esc(note)}`, undefined, m.message_id).catch(() => undefined); await askBookingQuestion(ref, prompt!.field, m.from!); };
  await db().prepare("DELETE FROM telegram_booking_prompts WHERE telegram_message_id=?").bind(prompt.telegram_message_id).run();

  if (prompt.field === "cost") {
    const cost = Number(text.replace(/[,\s฿]|THB|บาท/gi, ""));
    if (!Number.isInteger(cost) || cost < 0 || cost > 500000) { await again("Please send the cost as a number, e.g. 900."); return true; }
    await db().prepare(`INSERT INTO booking_costs(booking_reference,agreed_driver_cost,additional_costs,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,?,0,?,'unpaid',?,?,?)
      ON CONFLICT(booking_reference) DO UPDATE SET agreed_driver_cost=excluded.agreed_driver_cost,total_driver_cost=excluded.agreed_driver_cost+booking_costs.additional_costs,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(ref, cost, cost, `telegram:${adminName}`, now(), now()).run();
    await db().prepare("UPDATE telegram_booking_cards SET cost_done=1 WHERE booking_reference=?").bind(ref).run();
  } else {
    const row = await db().prepare("SELECT driver_form_json FROM telegram_booking_cards WHERE booking_reference=?").bind(ref).first<{ driver_form_json: string | null }>();
    const form: DriverForm = row?.driver_form_json ? JSON.parse(row.driver_form_json) : {};
    const value = text.slice(0, 120);
    if (prompt.field === "driver_name") { if (value.length < 3) { await again("Please send the driver's full name."); return true; } form.name = value; }
    if (prompt.field === "driver_phone") { if (!/^[+\d][\d\s()-]{7,}$/.test(value)) { await again("Please send a phone number, e.g. 081 234 5678."); return true; } form.phone = value.replace(/\s+/g, " "); }
    if (prompt.field === "driver_plate") form.plate = value;
    if (prompt.field === "driver_model") form.model = value;
    if (prompt.field === "driver_license") form.license = value;
    const next = DRIVER_STEPS[DRIVER_STEPS.indexOf(prompt.field) + 1];
    if (next) {
      await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=? WHERE booking_reference=?").bind(JSON.stringify(form), ref).run();
      await askBookingQuestion(ref, next, m.from);
      return true;
    }
    form.driverId = await saveDriver(form);
    await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=?,driver_done=1 WHERE booking_reference=?").bind(JSON.stringify(form), ref).run();
  }
  // Assign first, so the redrawn card can show the driver's (now working) link.
  await postAssignmentWhenReady(ref, adminName);
  await refresh(ref);
  return true;
}

/** Our own drivers (not outsource) who can be picked for a booking. */
export async function driverChoices() {
  const { results } = await db().prepare("SELECT id,full_name FROM drivers WHERE status='active' AND driver_type<>'outsource' ORDER BY full_name LIMIT 30").all<{ id: string; full_name: string }>();
  return results;
}

/** Assigns one of our drivers from the list; returns false if the driver isn't available. */
export async function pickDriver(reference: string, driverId: string, adminName: string, refresh: (reference: string) => Promise<unknown>) {
  const d = await db().prepare("SELECT id,full_name,phone,car_plate,vehicle,license_number FROM drivers WHERE id=? AND status='active' AND driver_type<>'outsource'").bind(driverId)
    .first<{ id: string; full_name: string; phone: string | null; car_plate: string | null; vehicle: string | null; license_number: string | null }>();
  if (!d) return false;
  const form: DriverForm = { name: d.full_name, phone: d.phone ?? undefined, plate: d.car_plate ?? undefined, model: d.vehicle ?? undefined, license: d.license_number ?? undefined, driverId: d.id };
  const done = await db().prepare("UPDATE telegram_booking_cards SET driver_form_json=?,driver_done=1 WHERE booking_reference=? AND driver_done=0").bind(JSON.stringify(form), reference).run();
  if (!done.meta.changes) return false;
  await postAssignmentWhenReady(reference, adminName);
  await refresh(reference);
  return true;
}

/** Same phone = same driver: details are updated; otherwise a new driver is added. */
async function saveDriver(f: DriverForm) {
  const digits = (f.phone ?? "").replace(/\D/g, "");
  const existing = await db().prepare("SELECT id FROM drivers WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') LIKE ? LIMIT 1").bind(`%${digits.slice(-9)}`).first<{ id: string }>();
  if (existing) {
    await db().prepare("UPDATE drivers SET full_name=?,car_plate=?,vehicle=?,license_number=?,status='active',updated_at=? WHERE id=?").bind(f.name, f.plate, f.model, f.license, now(), existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO drivers(id,full_name,phone,vehicle,car_plate,license_number,driver_type,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'outsource','active',?,?)")
    .bind(id, f.name, f.phone, f.model, f.plate, f.license, now(), now()).run();
  return id;
}

type BookingRow = { reference: string; customer_name: string; customer_surname: string | null; passengers: number; luggage: number; pickup_date: string; pickup_time: string; flight_number: string | null;
  pickup: string; dropoff: string; vehicle: string; payment_method: string; total: number; amount_paid: number };

/** When cost and driver are both done: assign the driver (one trip link) and post the job in Thai. */
export async function postAssignmentWhenReady(reference: string, by: string, header?: string) {
  const card = await db().prepare("SELECT cost_done,driver_done,assignment_posted,driver_form_json,telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference)
    .first<{ cost_done: number; driver_done: number; assignment_posted: number; driver_form_json: string | null; telegram_message_id: number }>();
  if (!card?.cost_done || !card.driver_done || card.assignment_posted) return false;
  const claimed = await db().prepare("UPDATE telegram_booking_cards SET assignment_posted=1 WHERE booking_reference=? AND assignment_posted=0").bind(reference).run();
  if (!claimed.meta.changes) return false;
  const b = await db().prepare("SELECT reference,customer_name,customer_surname,passengers,luggage,pickup_date,pickup_time,flight_number,pickup,dropoff,vehicle,payment_method,total,amount_paid FROM bookings WHERE reference=?").bind(reference).first<BookingRow>();
  const form = JSON.parse(card.driver_form_json ?? "{}") as DriverForm;
  if (!b || !form.driverId) { await db().prepare("UPDATE telegram_booking_cards SET assignment_posted=0 WHERE booking_reference=?").bind(reference).run(); return false; }
  // The driver's trip link: the driver updates status there, and the same page shows the trip's progress.
  const token = await driverTokenForAssignment(reference, "outbound"), at = now();
  const pickupAt = new Date(`${b.pickup_date}T${b.pickup_time}:00+07:00`).getTime();
  const expires = new Date(Math.max(Date.now() + 48 * 3600_000, pickupAt + 24 * 3600_000)).toISOString();
  await db().prepare("UPDATE booking_assignments SET revoked_at=?,updated_at=? WHERE booking_reference=? AND leg='outbound' AND revoked_at IS NULL").bind(at, at, reference).run();
  await db().prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES(?,?,'outbound',?,?,'assigned',?,?,?,?)")
    .bind(crypto.randomUUID(), reference, form.driverId, await sha256(token), `telegram:${by}`, at, expires, at).run();
  const link = `${SITE_URL}/driver/trip/${token}`;
  const [y, mo, d] = b.pickup_date.split("-");
  const cashDue = b.payment_method === "cash" ? Math.max(0, b.total - (b.amount_paid ?? 0)) : 0;
  const vehicleName = jobVehicleName(b.vehicle);
  const lines = [
    ...(header ? [header, ""] : []),
    `${esc(vehicleName)} 🚗`,
    "",
    `ชื่อลูกค้า: ${esc(fullName(b.customer_name, b.customer_surname))}`,
    `จำนวน: ${b.passengers} คน, ${b.luggage} กระเป๋า`,
    `วันที่/เวลา: ${d}/${mo}/${y} ${esc(b.pickup_time)}`,
    `ไฟลท์: ${esc(b.flight_number || "-")}`,
    `รับ: ${esc(b.pickup)}`,
    `ส่ง: ${esc(b.dropoff)}`,
    `ราคา: ${cashDue ? `${cashDue.toLocaleString("en-US")} บาท (เก็บเงินสดจากลูกค้า)` : "-"}`,
    "",
    `คนขับ: ${esc(form.name ?? "")} · ${esc(form.phone ?? "")}`,
    `รถ: ${esc(form.model ?? "")} · ทะเบียน ${esc(form.plate ?? "")}`,
    "",
    `ลิงก์งาน (สถานะการเดินทาง/คนขับ): ${link}`,
  ];
  await sendCard(lines.join("\n"), undefined, card.telegram_message_id || undefined);
  return true;
}

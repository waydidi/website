import { toSatang } from "@/lib/money";
import { assignDriver } from "@/lib/assignment-service";
import { deliverAssignmentTelegram } from "./assignments";
import { queueTelegram } from "./outbox";
import { ensureReliabilityTables, reliabilityDb } from "./reliability-db";
import { env } from "cloudflare:workers";
import { googleMapsLink } from "@/lib/maps-link";
import { esc } from "./cards";
import { telegramChatId, type TelegramMessage } from "./client";

// After a booking is taken in the Telegram group: "Set cost" and "Add driver information" ask
// their questions one at a time (Telegram's reply box opens for the person who tapped). When both
// are done, the job is posted to the group in Thai with one link for trip and driver status.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const now = () => new Date().toISOString();

type Field = "return_cost" | "cost" | "driver_name" | "driver_phone" | "driver_plate" | "driver_model" | "driver_license" | "pickup_map" | "dropoff_map";
const DRIVER_STEPS: Field[] = ["driver_name", "driver_phone", "driver_plate", "driver_model", "driver_license"];
const QUESTION: Record<Field, string> = {
  cost: "Driver cost in THB (numbers only)",
  return_cost:"Return driver cost in THB (numbers only)",
  driver_name: "Driver full name",
  driver_phone: "Driver phone number",
  driver_plate: "Car plate",
  driver_model: "Car model (e.g. Toyota Camry, black)",
  driver_license: "Driving licence number",
  pickup_map: "Google Maps link for the pickup (paste the share link)",
  dropoff_map: "Google Maps link for the drop-off (paste the share link)",
};
type DriverForm = { name?: string; phone?: string; plate?: string; model?: string; license?: string; driverId?: string };

/** Asks one question in the group; only the person who tapped gets the reply box. */
export async function askBookingQuestion(reference:string,field:Field,user:{id:number;first_name?:string},eventId=crypto.randomUUID()) {
  await ensureReliabilityTables();
  const version=await db().prepare("SELECT booking_version,status FROM bookings WHERE reference=?").bind(reference).first<{booking_version:number;status:string}>();
  if (!version || version.status!=="confirmed") return;
  const card=await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{telegram_message_id:number}>();
  const mention=`<a href="tg://user?id=${user.id}">${esc(user.first_name??"You")}</a>`;
  const step=DRIVER_STEPS.includes(field)?` (${DRIVER_STEPS.indexOf(field)+1}/${DRIVER_STEPS.length})`:"";
  await queueTelegram({id:`prompt:${eventId}:${field}`,reference,destination:telegramChatId(),payload:{text:`${mention}, booking <b>${esc(reference)}</b>${step}: ${QUESTION[field]}?`,replyTo:card?.telegram_message_id||undefined,prompt:{reference,field,userId:String(user.id),version:version.booking_version,placeholder:QUESTION[field]}}});
}

/** Answer, state changes and prompt consumption commit atomically. Replays recover the next question. */
export async function handleBookingAnswer(m:TelegramMessage,adminName:string,refresh:(reference:string)=>Promise<unknown>) {
  if (!m.from || String(m.chat.id)!==telegramChatId() || !m.text?.trim()) return false;
  await ensureReliabilityTables();
  const db=reliabilityDb(),text=m.text.trim(),answerId=`telegram:${m.chat.id}:${m.message_id}`;
  type Prompt={telegram_message_id:number;booking_reference:string;field:Field;telegram_user_id:string;booking_version:number;consumed_at:string|null;current_version:number;status:string};
  const available=await db.prepare("SELECT p.telegram_message_id FROM telegram_booking_prompts p JOIN telegram_prompt_context c ON c.message_id=p.telegram_message_id WHERE p.telegram_user_id=? AND p.created_at>? LIMIT 1").bind(String(m.from.id),new Date(Date.now()-10*60000).toISOString()).first();
  if (!available) return false;
  const base=`SELECT p.*,c.booking_version,c.consumed_at,b.booking_version current_version,b.status FROM telegram_booking_prompts p JOIN telegram_prompt_context c ON c.message_id=p.telegram_message_id JOIN bookings b ON b.reference=p.booking_reference WHERE p.telegram_user_id=? AND p.created_at>?`;
  const expiry=new Date(Date.now()-10*60000).toISOString();
  const prompt=m.reply_to_message ? await db.prepare(`${base} AND p.telegram_message_id=?`).bind(String(m.from.id),expiry,m.reply_to_message.message_id).first<Prompt>() : await db.prepare(`${base} AND c.consumed_at IS NULL ORDER BY p.created_at DESC LIMIT 1`).bind(String(m.from.id),expiry).first<Prompt>();
  if (!prompt || prompt.status!=="confirmed" || prompt.booking_version!==prompt.current_version) return false;
  const ref=prompt.booking_reference;
  const replay=await db.prepare("SELECT answer_id,next_field FROM telegram_prompt_answers WHERE prompt_id=?").bind(prompt.telegram_message_id).first<{answer_id:string;next_field:Field|null}>();
  if (replay) {
    if (replay.answer_id!==answerId) return false;
    if (replay.next_field) await askBookingQuestion(ref,replay.next_field,m.from,answerId);
    else {await postAssignmentWhenReady(ref,adminName);await refresh(ref);}
    return true;
  }
  if (prompt.consumed_at) return false;
  const at=now(),writes=[];
  const owned="EXISTS(SELECT 1 FROM telegram_prompt_answers WHERE prompt_id=? AND answer_id=?)";
  let next:Field|null=null,formJson:string|null=null;
  const invalid=async(note:string)=>{await queueTelegram({id:`answer-invalid:${answerId}`,destination:telegramChatId(),payload:{text:esc(note),replyTo:m.message_id}});return true;};
  if (prompt.field==='cost'||prompt.field==='return_cost') {
    const cleaned=text.replace(/[,\s฿]|THB|บาท/gi,"");
    const cost=Number(cleaned);
    if (!cleaned || !Number.isSafeInteger(cost) || cost<0 || cost>500000) return invalid("Please send the cost as a number, e.g. 900.");
    if (prompt.field==='return_cost') {
      writes.push(db.prepare(`INSERT INTO telegram_driver_leg_costs(booking_reference,leg,cost_minor,updated_at) SELECT ?,'return',?,? WHERE ${owned} ON CONFLICT(booking_reference,leg) DO UPDATE SET cost_minor=excluded.cost_minor,updated_at=excluded.updated_at`).bind(ref,toSatang(cost),at,prompt.telegram_message_id,answerId));
    } else {
      writes.push(db.prepare(`INSERT INTO booking_costs(booking_reference,agreed_driver_cost,additional_costs,total_driver_cost,payment_status,updated_by,created_at,updated_at) SELECT ?,?,0,?,'unpaid',?,?,? WHERE ${owned} ON CONFLICT(booking_reference) DO UPDATE SET agreed_driver_cost=excluded.agreed_driver_cost,total_driver_cost=excluded.agreed_driver_cost+booking_costs.additional_costs,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(ref,cost,cost,`telegram:${adminName}`,at,at,prompt.telegram_message_id,answerId));
      writes.push(db.prepare(`UPDATE telegram_booking_cards SET cost_done=1 WHERE booking_reference=? AND ${owned}`).bind(ref,prompt.telegram_message_id,answerId));
    }
  } else if (prompt.field==='pickup_map'||prompt.field==='dropoff_map') {
    const link=googleMapsLink(text);
    if (!link) return invalid("Please paste a Google Maps share link.");
    const column=prompt.field==='pickup_map'?'pickup_map_url':'dropoff_map_url';
    writes.push(db.prepare(`INSERT INTO booking_map_links(booking_reference,${column},updated_by,updated_at) SELECT ?,?,?,? WHERE ${owned} ON CONFLICT(booking_reference) DO UPDATE SET ${column}=excluded.${column},updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(ref,link,`telegram:${adminName}`,at,prompt.telegram_message_id,answerId));
  } else {
    const row=await db.prepare("SELECT driver_form_json FROM telegram_booking_cards WHERE booking_reference=?").bind(ref).first<{driver_form_json:string|null}>();
    formJson=row?.driver_form_json??null;
    const form:DriverForm=JSON.parse(formJson??"{}");
    const value=text.slice(0,120);
    if (prompt.field==='driver_name') {if(value.length<3)return invalid("Please send the driver's full name.");form.name=value;}
    if (prompt.field==='driver_phone') {if(!/^[+\d][\d\s()-]{7,}$/.test(value))return invalid("Please send a valid phone number.");form.phone=value;}
    if (prompt.field==='driver_plate') form.plate=value;
    if (prompt.field==='driver_model') form.model=value;
    if (prompt.field==='driver_license') form.license=value;
    next=DRIVER_STEPS[DRIVER_STEPS.indexOf(prompt.field)+1]??null;
    if (!next) {
      const digits=(form.phone??'').replace(/\D/g,'');
      if (!form.name || digits.length<8) return invalid("Driver name and phone are required. Start the driver questions again.");
      const existing=await db.prepare("SELECT id FROM drivers WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') LIKE ? LIMIT 1").bind(`%${digits.slice(-9)}`).first<{id:string}>();
      form.driverId=existing?.id??crypto.randomUUID();
      if (existing) writes.push(db.prepare(`UPDATE drivers SET full_name=?,car_plate=?,vehicle=?,license_number=?,updated_at=? WHERE id=? AND ${owned}`).bind(form.name,form.plate??null,form.model??null,form.license??null,at,existing.id,prompt.telegram_message_id,answerId));
      else writes.push(db.prepare(`INSERT INTO drivers(id,full_name,phone,vehicle,car_plate,license_number,driver_type,status,created_at,updated_at) SELECT ?,?,?,?,?,?,'outsource','active',?,? WHERE ${owned}`).bind(form.driverId,form.name,form.phone,form.model??null,form.plate??null,form.license??null,at,at,prompt.telegram_message_id,answerId));
    }
    writes.push(db.prepare(`UPDATE telegram_booking_cards SET driver_form_json=?,driver_done=CASE WHEN ? THEN 1 ELSE driver_done END WHERE booking_reference=? AND ${owned}`).bind(JSON.stringify(form),next?0:1,ref,prompt.telegram_message_id,answerId));
  }
  const [claimed]=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_prompt_answers(prompt_id,answer_id,next_field,applied_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM telegram_prompt_context c JOIN telegram_booking_prompts p ON p.telegram_message_id=c.message_id JOIN bookings b ON b.reference=p.booking_reference WHERE c.message_id=? AND c.consumed_at IS NULL AND b.status='confirmed' AND b.booking_version=c.booking_version AND p.telegram_user_id=? AND p.created_at>?) ${DRIVER_STEPS.includes(prompt.field)?"AND EXISTS(SELECT 1 FROM telegram_booking_cards WHERE booking_reference=? AND driver_form_json IS ?)":""}`).bind(prompt.telegram_message_id,answerId,next,at,prompt.telegram_message_id,String(m.from.id),expiry,...(DRIVER_STEPS.includes(prompt.field)?[ref,formJson]:[])),
    ...writes,
    db.prepare(`UPDATE telegram_prompt_context SET consumed_at=? WHERE message_id=? AND ${owned}`).bind(at,prompt.telegram_message_id,prompt.telegram_message_id,answerId),
  ]);
  if (!claimed.meta.changes) return false;
  if (prompt.field==='cost'||prompt.field==='return_cost') {
    // Tell the group the cost is saved (the card refresh alone is easy to miss); same id on a retry, so it is sent once.
    const saved=Number(text.replace(/[,\s฿]|THB|บาท/gi,""));
    await queueTelegram({id:`answer-saved:${answerId}`,reference:ref,destination:telegramChatId(),payload:{text:`✅ บันทึกค่าคนขับ${prompt.field==='return_cost'?"เที่ยวกลับ":""}ของ <b>${esc(ref)}</b> แล้ว: ฿${saved.toLocaleString("en-US")}`,replyTo:m.message_id}}).catch(()=>undefined);
  }
  if (next) await askBookingQuestion(ref,next,m.from,answerId);
  else {await postAssignmentWhenReady(ref,adminName);await refresh(ref);}
  return true;
}

/** Saves a booking's driver cost (shown as the Price on the driver page) and marks the card's cost done. */
export async function saveDriverCost(reference: string, cost: number, adminName: string) {
  await db().prepare(`INSERT INTO booking_costs(booking_reference,agreed_driver_cost,additional_costs,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,?,0,?,'unpaid',?,?,?)
    ON CONFLICT(booking_reference) DO UPDATE SET agreed_driver_cost=excluded.agreed_driver_cost,total_driver_cost=excluded.agreed_driver_cost+booking_costs.additional_costs,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(reference, cost, cost, `telegram:${adminName}`, now(), now()).run();
  await db().prepare("UPDATE telegram_booking_cards SET cost_done=1 WHERE booking_reference=?").bind(reference).run();
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
  // Not assigned after all (schedule conflict…): the slot was freed and the team group told why.
  return Boolean(await db().prepare("SELECT 1 x FROM telegram_booking_cards WHERE booking_reference=? AND driver_done=1").bind(reference).first());
}

type BookingRow = { reference: string; customer_name: string; customer_surname: string | null; passengers: number; luggage: number; pickup_date: string; pickup_time: string; flight_number: string | null;
  pickup: string; dropoff: string; vehicle: string; booking_version:number; status:string; payment_method: string; total: number; amount_paid: number;
  service_type: string | null; pricing_area: string | null; booked_hours: number | null; driver_cost: number | null };

/** When cost and driver are both done: assign the driver (one trip link) and post the job in Thai. */
export async function postAssignmentWhenReady(reference: string, by: string, header?: string, offer?:{offerKey:string;holderId:string}) {
  const card = await db().prepare("SELECT cost_done,driver_done,assignment_posted,driver_form_json,telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference)
    .first<{ cost_done: number; driver_done: number; assignment_posted: number; driver_form_json: string | null; telegram_message_id: number }>();
  if (!card?.cost_done || !card.driver_done || card.assignment_posted) return false;
  const b = await db().prepare(`SELECT b.reference,b.customer_name,b.customer_surname,b.passengers,b.luggage,b.pickup_date,b.pickup_time,b.flight_number,b.pickup,b.dropoff,b.vehicle,b.booking_version,b.status,b.payment_method,b.total,b.amount_paid,
      b.service_type,b.pricing_area,b.booked_hours,NULLIF(COALESCE(NULLIF(c.total_driver_cost,0),c.agreed_driver_cost),0) AS driver_cost
    FROM bookings b LEFT JOIN booking_costs c ON c.booking_reference=b.reference WHERE b.reference=?`).bind(reference).first<BookingRow>();
  const form = JSON.parse(card.driver_form_json ?? "{}") as DriverForm;
  if (!b || b.status!=="confirmed" || !form.driverId) return false;
  // The driver's trip link: the driver updates status there, and the same page shows the trip's progress.
  const committed=await assignDriver({reference,leg:"outbound",driverId:form.driverId,by:`telegram:${by}`,expectedVersion:b.booking_version,expectedAssignmentId:null,idempotencyKey:`telegram:${reference}:outbound:${b.booking_version}:${form.driverId}`,telegramHeader:header??"",telegramDriverDm:true,telegramReplyTo:card.telegram_message_id||undefined,...offer});
  if (!committed.ok) {
    // A driver chosen by staff who cannot be assigned (schedule conflict, booking changed) must not stay "set":
    // the slot is freed so staff can choose again, and the team group is told why. The driver-group take path
    // (offer) undoes and reports its own failure.
    if (!offer) {
      await db().prepare("UPDATE telegram_booking_cards SET driver_done=0,driver_form_json=NULL WHERE booking_reference=? AND driver_form_json=? AND assignment_posted=0").bind(reference, card.driver_form_json).run();
      await queueTelegram({ id: `assign-failed:${reference}:${b.booking_version}:${form.driverId}`, reference, destination: telegramChatId(), payload: { text: `⚠️ มอบหมายงาน <b>${esc(reference)}</b> ให้ ${esc(form.name ?? "คนขับ")} ไม่สำเร็จ: ${esc(committed.error)}\nเลือกคนขับใหม่ในการ์ดการจอง`, replyTo: card.telegram_message_id || undefined } }).catch(() => undefined);
    }
    return false;
  }
  await deliverAssignmentTelegram(committed.assignment.id);
  return true;
}

import { ensureReliabilityTables } from "./reliability-db";
import { fullName } from "@/lib/person-name";
import { driverJobText,jobVehicleName } from "./job-text";
import { paymentLabelThai } from "@/lib/payment-methods";
import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import { esc } from "./cards";
import { sendCard, telegramChatId, telegramConfigured, TelegramDeliveryError } from "./client";

// Uses the existing notification outbox. The queue row is committed with the assignment.
export function assignmentTelegramNotification(assignment: { id: string; bookingReference: string; assignedAt: string }) {
  return { id: crypto.randomUUID(), bookingReference: assignment.bookingReference, assignmentId: assignment.id,
    notificationType: "driver_assignment", channel: "telegram", recipient: telegramChatId(),
    dedupeKey: `telegram-driver-assignment:${assignment.id}`, scheduledFor: assignment.assignedAt,
    status: "queued", attemptCount: 0, createdAt: assignment.assignedAt, updatedAt: assignment.assignedAt };
}

type Job = { id: string; recipient: string; assignment_id: string; attempt_count: number };
type Assignment = { booking_reference: string; leg: string; driver_name: string; driver_phone: string | null;
  token_hash: string; driver_token: string; revoked_at: string | null; token_expires_at: string;
  booking_status: string; pickup: string; dropoff: string; pickup_date: string; pickup_time: string;
  return_pickup: string | null; return_dropoff: string | null; return_date: string | null; return_time: string | null };

export async function deliverAssignmentTelegram(assignmentId: string) {
  await ensureReliabilityTables();
  const db = env.DB as SecurityDatabase, now = new Date().toISOString();
  if (!telegramConfigured()) {
    await db.prepare("UPDATE booking_notifications SET error_message='Telegram bot token or destination missing',updated_at=? WHERE assignment_id=? AND channel='telegram' AND status IN ('queued','failed')").bind(now, assignmentId).run();
    return "queued";
  }
  const job = await db.prepare("SELECT id,recipient,assignment_id,attempt_count FROM booking_notifications WHERE assignment_id=? AND channel='telegram' AND status IN ('queued','failed') AND scheduled_for<=?").bind(assignmentId, now).first<Job>();
  if (!job) return "unchanged";
  // A destination change requires staff review rather than disclosing an old trip to another chat.
  if (job.recipient && job.recipient !== telegramChatId()) return "queued";
  const a = await db.prepare(`SELECT a.booking_reference,a.leg,a.token_hash,a.revoked_at,a.token_expires_at,
    d.full_name driver_name,d.phone driver_phone,l.driver_token,
    CASE WHEN b.status='confirmed' AND (j.status IS NULL OR j.status='pending_payment') THEN 'confirmed'
      WHEN b.status='confirmed' THEN j.status ELSE b.status END booking_status,b.pickup,b.dropoff,
    CASE WHEN a.leg='outbound' THEN COALESCE(j.pickup_date,b.pickup_date) ELSE b.pickup_date END pickup_date,
    CASE WHEN a.leg='outbound' THEN COALESCE(j.pickup_time,b.pickup_time) ELSE b.pickup_time END pickup_time,
    b.return_pickup,b.return_dropoff,
    CASE WHEN a.leg='return' THEN COALESCE(j.pickup_date,b.return_date) ELSE b.return_date END return_date,
    CASE WHEN a.leg='return' THEN COALESCE(j.pickup_time,b.return_time) ELSE b.return_time END return_time FROM booking_assignments a
    JOIN drivers d ON d.id=a.driver_id JOIN bookings b ON b.reference=a.booking_reference
    JOIN booking_links l ON l.booking_reference=a.booking_reference AND l.leg=a.leg
    LEFT JOIN journey_legs j ON j.booking_reference=a.booking_reference AND j.leg=a.leg WHERE a.id=?`).bind(assignmentId).first<Assignment>();
  if (!a || a.revoked_at || a.token_expires_at <= now || a.booking_status !== "confirmed" || await sha256(a.driver_token) !== a.token_hash) {
    await db.prepare("UPDATE booking_notifications SET status='cancelled',updated_at=?,error_message='Assignment or driver link is no longer active' WHERE id=? AND status IN ('queued','failed')").bind(now, job.id).run();
    return "cancelled";
  }
  const meta=await db.prepare("SELECT header,reply_to,driver_dm FROM telegram_assignment_messages WHERE assignment_id=?").bind(assignmentId).first<{header:string;reply_to:number|null;driver_dm:number}>();
  const details=await db.prepare(`SELECT b.reference,b.vehicle,b.customer_name,b.customer_surname,b.passengers,b.luggage,b.service_type,b.pricing_area,b.booked_hours,b.payment_method,b.total,b.amount_paid,b.flight_number,d.full_name,d.phone,d.vehicle driver_car,d.car_plate,
    CASE WHEN a.leg='return' THEN lc.cost_minor/100.0 ELSE NULLIF(COALESCE(NULLIF(c.total_driver_cost,0),c.agreed_driver_cost),0) END driver_cost,m.pickup_map_url,m.dropoff_map_url
    FROM bookings b JOIN booking_assignments a ON a.booking_reference=b.reference JOIN drivers d ON d.id=a.driver_id
    LEFT JOIN booking_costs c ON c.booking_reference=b.reference LEFT JOIN telegram_driver_leg_costs lc ON lc.booking_reference=b.reference AND lc.leg=a.leg LEFT JOIN booking_map_links m ON m.booking_reference=b.reference WHERE a.id=?`).bind(assignmentId).first<Record<string,string|number|null>>();
  const ret=a.leg==='return',link=`${SITE_URL}/driver/trip/${a.driver_token}`;
  const pickup=ret?a.return_pickup||a.dropoff:a.pickup,dropoff=ret?a.return_dropoff||a.pickup:a.dropoff;
  const date=ret?a.return_date:a.pickup_date,time=ret?a.return_time:a.pickup_time;
  const cashDue=details?.payment_method==='cash'?Math.max(0,Number(details.total)-Number(details.amount_paid??0)):0;
  const collect=cashDue?(ret?'ตรวจสอบยอดเงินสดคงเหลือล่าสุดในลิงก์งานก่อนเก็บเงิน':`เก็บเงินสดจากลูกค้า ${cashDue.toLocaleString('en-US')} บาท`):details?.payment_method==='transfer'&&Number(details.amount_paid??0)<Number(details.total)?paymentLabelThai('transfer','pending'):'';
  if (details && (meta?.driver_dm || (env as unknown as Record<string,string>).TELEGRAM_DRIVER_UPDATES==='1')) {
    const sheet=[esc(driverJobText({reference:a.booking_reference,vehicle:String(details.vehicle),customerName:String(details.customer_name),customerSurname:details.customer_surname as string|null,passengers:Number(details.passengers),luggage:Number(details.luggage),pickupDate:date!,pickupTime:time!,pickup,dropoff,serviceType:ret?'transfer':details.service_type as string|null,pricingArea:details.pricing_area as string|null,bookedHours:ret?null:Number(details.booked_hours)||null},Number(details.driver_cost)||null,{pickup:(ret?details.dropoff_map_url:details.pickup_map_url) as string|null,dropoff:(ret?details.pickup_map_url:details.dropoff_map_url) as string|null})),...(collect?[esc(collect)]:[]),'',`ลิงก์งาน: ${link}`].join('\n');
    const driver=await db.prepare("SELECT driver_id FROM booking_assignments WHERE id=?").bind(assignmentId).first<{driver_id:string}>();
    if (driver) await import('./driver-group').then(m=>m.sendJobToLinkedDriver(driver.driver_id,sheet,`driver-job:${assignmentId}`,assignmentId,false));
  }
  const claimed = await db.prepare("UPDATE booking_notifications SET status='processing',attempt_count=attempt_count+1,last_attempt_at=?,updated_at=?,recipient=? WHERE id=? AND status IN ('queued','failed') AND scheduled_for<=? AND EXISTS(SELECT 1 FROM booking_assignments WHERE id=? AND revoked_at IS NULL AND token_hash=? AND token_expires_at>?)").bind(now, now, telegramChatId(), job.id, now, assignmentId, a.token_hash, now).run();
  if (!claimed.meta.changes) return "unchanged";
  const field = (value: unknown) => esc(String(value ?? "").slice(0, 500));
  let text = [`<b>Driver assigned</b> · ${esc(a.booking_reference)} · ${ret ? "Return" : "Outbound"}`,
    `Driver: ${field(a.driver_name)}${a.driver_phone ? ` · ${field(a.driver_phone)}` : ""}`,
    `Pickup: ${field(ret ? a.return_pickup || a.dropoff : a.pickup)}`,
    `Drop-off: ${field(ret ? a.return_dropoff || a.pickup : a.dropoff)}`,
    `Date/time (Thailand): ${esc(ret ? a.return_date : a.pickup_date)} ${esc(ret ? a.return_time : a.pickup_time)}`,
    `Driver link: ${link}`].join("\n");
  if (meta && details) {
    const [year,month,day]=date!.split('-');
    text=[...(meta.header?[meta.header,'']:[]),`${esc(jobVehicleName(String(details.vehicle)))} 🚗`,'',`ชื่อลูกค้า: ${esc(fullName(String(details.customer_name),details.customer_surname as string|null))}`,`จำนวน: ${details.passengers} คน, ${details.luggage} กระเป๋า`,`วันที่: ${day}/${month}/${year}`,`เวลา: ${esc(time)}`,`ไฟลท์: ${ret?'-':esc(details.flight_number||'-')}`,`รับ: ${esc(pickup)}`,`ส่ง: ${esc(dropoff)}`,`ราคา: ${details.driver_cost?`${Number(details.driver_cost).toLocaleString('en-US')} บาท`:'-'}${collect?` (${esc(collect)})`:''}`,'',`คนขับ: ${esc(details.full_name)}`,`เบอร์: ${esc(details.phone)}`,...(details.driver_car?[`รถ: ${esc(details.driver_car)}`]:[]),`ทะเบียน: ${esc(details.car_plate)}`,'',`ลิงก์งาน (สถานะการเดินทาง/คนขับ): ${link}`].join('\n');
  }
  let status = "sent", error: string | null = null;
  try { await sendCard(text, meta?undefined:[[ {text:"Open driver trip",url:link} ]], meta?.reply_to??undefined); }
  catch (e) {
    status = e instanceof TelegramDeliveryError && e.retryable ? "failed" : "uncertain";
    error = e instanceof TelegramDeliveryError ? e.message : "Telegram delivery outcome unknown";
  }
  // Persist outside the send catch: a DB failure after acceptance must never trigger another send.
  const at = new Date().toISOString(), next = new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.min(job.attempt_count, 6)) * 1000).toISOString();
  await db.prepare("UPDATE booking_notifications SET status=?,error_message=?,sent_at=?,scheduled_for=?,updated_at=? WHERE id=? AND status='processing'").bind(status, error, status === "sent" ? at : null, next, at, job.id).run();
  await import("./outbox").then(m=>m.retryTelegramOutbox()).catch(()=>undefined);
  return status;
}

export async function retryAssignmentTelegram(limit = 10) {
  const db = env.DB as SecurityDatabase, now = new Date().toISOString();
  // Interrupted sends have an unknown provider outcome. Never blindly repost them.
  await db.prepare("UPDATE booking_notifications SET status='uncertain',error_message='Interrupted send; check Telegram before retrying',updated_at=? WHERE channel='telegram' AND status='processing' AND last_attempt_at<?").bind(now, new Date(Date.now() - 120000).toISOString()).run();
  const rows = (await db.prepare("SELECT assignment_id FROM booking_notifications WHERE channel='telegram' AND notification_type='driver_assignment' AND status IN ('queued','failed') AND scheduled_for<=? ORDER BY scheduled_for LIMIT ?").bind(now, limit).all<{ assignment_id: string }>()).results;
  for (const row of rows) await deliverAssignmentTelegram(row.assignment_id).catch(()=>console.error("Telegram assignment retry failed"));
}

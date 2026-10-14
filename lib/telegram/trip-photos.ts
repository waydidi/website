import { queueTelegram } from "./outbox";
import { env } from "cloudflare:workers";
import type { EvidenceRow } from "@/lib/trip-evidence";
import { esc } from "./cards";
import { telegramChatId, type InlineKeyboard } from "./client";
import { driverOfferMessage } from "./driver-group";
import { mapsUrl, nearestPlace } from "@/lib/place-name";

// A driver's Stand by / Pick up / Drop photo, posted to the group under the booking's card. The Drop
// carries a "Completed job" button: an admin checks the photo and confirms, which completes the job.

export const STEP_PHOTO_LABEL: Record<string, string> = { standby: "Stand by", trip_started: "Pick up", completed: "Drop" };
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
export const completedJobKeyboard = (eventId: string): InlineKeyboard => [[{ text: "✅ Completed job", callback_data: `trip_done:${eventId}` }]];

/** `done`: the job was already completed (all three photos in), so the Drop needs no button. */
export async function postTripPhoto(input: { reference: string; status: string; eventId: string; driverName: string; evidence: EvidenceRow | null; done?: boolean }) {
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(input.reference).first<{ telegram_message_id: number }>().catch(() => null);
  const keyboard = input.status === "completed" && !input.done ? completedJobKeyboard(input.eventId) : undefined;
  const e = input.evidence;
  const lines = [`✅<b>${esc(STEP_PHOTO_LABEL[input.status] ?? input.status)}</b> (${esc(input.reference)})`, esc(stepTime(e?.device_captured_at ?? new Date().toISOString()))];
  const photos=e?[{key:e.original_key,mime:"image/jpeg"}]:undefined;
  const offer=await driverOfferMessage(input.reference,input.evidence?.leg??"outbound").catch(()=>null);
  if (photos && offer) await queueTelegram({id:`step:${input.eventId}:driver-group`,reference:input.reference,destination:offer.chatId,payload:{text:lines.join("\n"),photos,replyTo:offer.messageId}});
  if (keyboard) lines.push("","Check the photo, then tap Completed job.");
  // The Admin group also gets where the photo was taken: the nearest named place and a Google Maps link (not in the driver group).
  if (e && e.latitude != null && e.longitude != null) {
    const place = await nearestPlace(e.latitude, e.longitude);
    lines.splice(2, 0, ...(place ? [`📍 <b>${esc(place.name)}</b>${place.address ? ` — ${esc(place.address)}` : ""}`] : ["📍 Location"]), mapsUrl(e.latitude, e.longitude));
  }
  if (photos || keyboard) return queueTelegram({id:`step:${input.eventId}:team`,reference:input.reference,destination:telegramChatId(),payload:{text:(photos?lines:[...lines.slice(0,2),"No photo",...lines.slice(2)]).join("\n"),photos,keyboard,replyTo:card?.telegram_message_id||undefined}});
}

/** "2026-10-11" → "11/10/2026". */
const dayMonthYear = (date: string | null) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : date || "-");
/** "06:00" → "6:00 AM", "13:30" → "1:30 PM". */
function clock(time: string | null) {
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time || "-";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** dd/mm/yyyy — h:mm AM/PM, in Thailand time. */
export function stepTime(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} — ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

/**
 * A journey was completed because its Stand by, Pick up and Drop photos are all in (from the driver or
 * added by staff): the three photos go to the group as one album, under the booking's card.
 */
export async function postJobCompleted(reference: string, leg: string) {
  type Row = { step: string; key: string; mime: string; at: string };
  const driverRows = await db().prepare(`SELECT COALESCE(s.status, CASE WHEN e.event_type='dropoff' THEN 'completed' END) AS step, e.original_key AS key, 'image/jpeg' AS mime, e.received_at AS at
    FROM driver_trip_evidence e LEFT JOIN driver_status_events s ON s.id=e.status_event_id WHERE e.booking_reference=? AND e.leg=? AND e.deleted_at IS NULL`).bind(reference, leg).all<Row>().catch(() => ({ results: [] as Row[] }));
  const staffRows = await db().prepare("SELECT step, file_key AS key, mime, created_at AS at FROM admin_evidence_photos WHERE booking_reference=? AND leg=?").bind(reference, leg).all<Row>().catch(() => ({ results: [] as Row[] }));
  // One photo per step, newest first; the driver's own photo wins over one added by staff.
  const pick = (step: string) => [...driverRows.results.filter((r) => r.step === step).sort((a, b) => b.at.localeCompare(a.at)), ...staffRows.results.filter((r) => r.step === step).sort((a, b) => b.at.localeCompare(a.at))][0];
  const photos: { key: string; mime: string }[] = [];
  for (const step of ["standby", "trip_started", "completed"]) {
    const row = pick(step);
    if (row) photos.push({key:row.key,mime:row.mime||"image/jpeg"});
  }
  type Info = { pickup: string; dropoff: string; pickupDate: string; pickupTime: string; returnDate: string | null; returnTime: string | null; returnPickup: string | null; returnDropoff: string | null;
    serviceType: string | null; bookedHours: number | null; driver: string | null; phone: string | null; plate: string | null; car: string | null };
  const info = await db().prepare(`SELECT b.pickup, b.dropoff, b.pickup_date AS pickupDate, b.pickup_time AS pickupTime, b.return_date AS returnDate, b.return_time AS returnTime,
      b.return_pickup AS returnPickup, b.return_dropoff AS returnDropoff, b.service_type AS serviceType, b.booked_hours AS bookedHours
    FROM bookings b WHERE b.reference=?`).bind(reference).first<Info>().catch(() => null);
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>().catch(() => null);
  // This journey's route, date and time (the second trip runs the other way unless set otherwise).
  const back = leg === "return" && info?.returnDate;
  const from = info ? (back ? info.returnPickup || info.dropoff : info.pickup) : "";
  const to = info ? (back ? info.returnDropoff || info.pickup : info.serviceType === "hourly" ? `${info.bookedHours ?? ""} hours` : info.dropoff) : "";
  const date = info ? (back ? info.returnDate : info.pickupDate) : null, time = info ? (back ? info.returnTime : info.pickupTime) : null;
  const lines = ["✅ <b>Completed job</b>", `Reference ID: ${esc(reference)}`];
  if (info) lines.push(`Route: ${esc(from)} – ${esc(to)}`, `Date: ${esc(dayMonthYear(date))}`, `Time: ${esc(clock(time))}`);
  if (info?.returnDate && leg === "outbound") lines.push("", "Next: the second trip.");
  // A reply under the booking's card, quoting its "Reference: …" line; without the quote if Telegram can't
  // find that text (e.g. the card was changed), and as a plain message if the card was never posted.
  const offer=await driverOfferMessage(reference,leg).catch(()=>null);
  if (offer) await queueTelegram({id:`completed:${reference}:${leg}:driver-group`,reference,leg,destination:offer.chatId,payload:{text:lines.join("\n"),photos,replyTo:offer.messageId}});
  const replyTo=card?.telegram_message_id||undefined;
  return queueTelegram({id:`completed:${reference}:${leg}:team`,reference,leg,destination:telegramChatId(),payload:{text:lines.join("\n"),photos,replyTo,quote:replyTo?`Reference: ${reference}`:undefined}});
}

/**
 * Repair a Worker interruption between a saved driver step and its notification enqueue. Only recent steps are
 * repaired: a step without a delivery record from before the last day is history (sent before the delivery
 * queue existed, or the queue was cleaned up), and posting it now would flood the group with old photos.
 */
export const REPAIR_WINDOW_MS = 24 * 3600_000;
export async function recoverTripNotifications(limit=20, now=Date.now()) {
  const {ensureReliabilityTables,reliabilityDb}=await import('./reliability-db');
  await ensureReliabilityTables();
  const rows=(await reliabilityDb().prepare(`SELECT s.id event_id,s.status step,s.booking_reference reference,a.leg,d.full_name driver,
    e.*,j.status journey_status FROM driver_status_events s JOIN booking_assignments a ON a.id=s.assignment_id JOIN drivers d ON d.id=a.driver_id
    LEFT JOIN driver_trip_evidence e ON e.status_event_id=s.id AND e.deleted_at IS NULL
    LEFT JOIN journey_legs j ON j.booking_reference=s.booking_reference AND j.leg=a.leg
    WHERE s.status IN ('standby','trip_started','completed') AND (e.id IS NOT NULL OR s.status='completed')
      AND s.created_at>? AND NOT EXISTS(SELECT 1 FROM telegram_delivery_jobs n WHERE n.id='step:'||s.id||':team')
    ORDER BY s.created_at DESC LIMIT ?`).bind(new Date(now-REPAIR_WINDOW_MS).toISOString(),limit).all<EvidenceRow & {event_id:string;step:string;reference:string;leg:string;driver:string;journey_status:string|null}>()).results;
  for (const row of rows) await postTripPhoto({reference:row.reference,status:row.step,eventId:row.event_id,driverName:row.driver,evidence:row.id?row:null,done:row.journey_status==='completed'});
}

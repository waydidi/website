import { env } from "cloudflare:workers";
import { getFile } from "@/lib/file-store";
import type { EvidenceRow } from "@/lib/trip-evidence";
import { esc } from "./cards";
import { sendCard, sendPhoto, sendPhotoAlbum, sendTo, telegramConfigured, type InlineKeyboard } from "./client";
import { driverOfferMessage } from "./driver-group";

// A driver's Stand by / Pick up / Drop photo, posted to the group under the booking's card. The Drop
// carries a "Completed job" button: an admin checks the photo and confirms, which completes the job.

export const STEP_PHOTO_LABEL: Record<string, string> = { standby: "Stand by", trip_started: "Pick up", completed: "Drop" };
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
export const completedJobKeyboard = (eventId: string): InlineKeyboard => [[{ text: "✅ Completed job", callback_data: `trip_done:${eventId}` }]];

/** `done`: the job was already completed (all three photos in), so the Drop needs no button. */
export async function postTripPhoto(input: { reference: string; status: string; eventId: string; driverName: string; evidence: EvidenceRow | null; done?: boolean }) {
  if (!telegramConfigured()) return;
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(input.reference).first<{ telegram_message_id: number }>().catch(() => null);
  const keyboard = input.status === "completed" && !input.done ? completedJobKeyboard(input.eventId) : undefined;
  const e = input.evidence;
  const stored = e ? await getFile(e.original_key) : null;
  // "✅Stand by (FMBNUW)" and when the photo was taken: "11/10/2026 — 6:05 AM" (Thailand time).
  const lines = [`✅<b>${esc(STEP_PHOTO_LABEL[input.status] ?? input.status)}</b> (${esc(input.reference)})`, esc(stepTime(e?.device_captured_at ?? new Date().toISOString()))];
  const photo = stored ? await new Response(stored.body).arrayBuffer() : null;
  // The driver group sees the same photo and text under the job's offer, without the staff-only button.
  if (photo) await toDriverGroup(input.reference, (chatId, replyTo) => sendPhoto(photo, lines.join("\n"), replyTo, undefined, undefined, chatId));
  if (keyboard) lines.push("", "Check the photo, then tap Completed job.");
  if (photo) return sendPhoto(photo, lines.join("\n"), card?.telegram_message_id || undefined, keyboard);
  // A Drop without a photo (an admin exception) still needs the button.
  if (keyboard) return sendCard([...lines.slice(0, 2), "No photo", ...lines.slice(2)].join("\n"), keyboard, card?.telegram_message_id || undefined);
}

/** A copy for the driver group (when it's on); a failure there never blocks the team group's post. */
async function toDriverGroup(reference: string, send: (chatId: string, replyTo?: number) => Promise<unknown>) {
  const offer = await driverOfferMessage(reference).catch(() => null);
  if (offer) await send(offer.chatId, offer.messageId).catch((error) => console.error("driver group photo failed", error instanceof Error ? error.message : "unknown"));
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
  if (!telegramConfigured()) return;
  type Row = { step: string; key: string; mime: string; at: string };
  const driverRows = await db().prepare(`SELECT COALESCE(s.status, CASE WHEN e.event_type='dropoff' THEN 'completed' END) AS step, e.original_key AS key, 'image/jpeg' AS mime, e.received_at AS at
    FROM driver_trip_evidence e LEFT JOIN driver_status_events s ON s.id=e.status_event_id WHERE e.booking_reference=? AND e.leg=? AND e.deleted_at IS NULL`).bind(reference, leg).all<Row>().catch(() => ({ results: [] as Row[] }));
  const staffRows = await db().prepare("SELECT step, file_key AS key, mime, created_at AS at FROM admin_evidence_photos WHERE booking_reference=? AND leg=?").bind(reference, leg).all<Row>().catch(() => ({ results: [] as Row[] }));
  // One photo per step, newest first; the driver's own photo wins over one added by staff.
  const pick = (step: string) => [...driverRows.results.filter((r) => r.step === step).sort((a, b) => b.at.localeCompare(a.at)), ...staffRows.results.filter((r) => r.step === step).sort((a, b) => b.at.localeCompare(a.at))][0];
  const photos: { bytes: ArrayBuffer; mime: string }[] = [];
  for (const step of ["standby", "trip_started", "completed"]) {
    const row = pick(step);
    const file = row ? await getFile(row.key).catch(() => null) : null;
    if (file) photos.push({ bytes: await new Response(file.body).arrayBuffer(), mime: row!.mime || "image/jpeg" });
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
  await toDriverGroup(reference, (chatId, offerId) => photos.length >= 2 ? sendPhotoAlbum(photos, lines.join("\n"), offerId, undefined, chatId)
    : photos.length === 1 ? sendPhoto(photos[0].bytes, lines.join("\n"), offerId, undefined, undefined, chatId)
    : sendTo(chatId, lines.join("\n"), undefined, offerId));
  const replyTo = card?.telegram_message_id || undefined;
  const send = (quote?: string): Promise<unknown> => photos.length >= 2 ? sendPhotoAlbum(photos, lines.join("\n"), replyTo, quote)
    : photos.length === 1 ? sendPhoto(photos[0].bytes, lines.join("\n"), replyTo, undefined, quote)
    : sendCard(lines.join("\n"), undefined, replyTo, quote);
  if (!replyTo) return send();
  return send(`Reference: ${reference}`).catch((error) => { console.error("Completed job quote failed, sending without it", error); return send(); });
}

import { env } from "cloudflare:workers";
import { getFile } from "@/lib/file-store";
import { ictTime } from "@/lib/evidence-rules";
import type { EvidenceRow } from "@/lib/trip-evidence";
import { esc } from "./cards";
import { sendCard, sendPhoto, sendPhotoAlbum, telegramConfigured, type InlineKeyboard } from "./client";

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
  const lines = [`📸 <b>${esc(STEP_PHOTO_LABEL[input.status] ?? input.status)}</b> · ${esc(input.reference)}`, `Driver: ${esc(input.driverName)}`];
  if (e) {
    lines.push(`🕒 ${esc(ictTime(e.device_captured_at))}`, e.latitude !== null && e.longitude !== null
      ? `📍 <a href="https://www.google.com/maps?q=${e.latitude},${e.longitude}">${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}</a>${e.accuracy_metres ? ` ±${Math.round(e.accuracy_metres)} m` : ""}`
      : "📍 Location unavailable");
  }
  if (keyboard) lines.push("", "Check the photo, then tap Completed job.");
  if (stored) return sendPhoto(await new Response(stored.body).arrayBuffer(), lines.join("\n"), card?.telegram_message_id || undefined, keyboard);
  // A Drop without a photo (an admin exception) still needs the button.
  if (keyboard) return sendCard([...lines.slice(0, 2), "No photo", ...lines.slice(2)].join("\n").replace("📸", "🏁"), keyboard, card?.telegram_message_id || undefined);
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
  const info = await db().prepare(`SELECT b.return_date AS returnDate, d.full_name AS driver, d.phone AS phone, d.car_plate AS plate FROM bookings b LEFT JOIN booking_assignments a ON a.booking_reference=b.reference AND a.leg=? AND a.revoked_at IS NULL LEFT JOIN drivers d ON d.id=a.driver_id WHERE b.reference=?`).bind(leg, reference).first<{ returnDate: string | null; driver: string | null; phone: string | null; plate: string | null }>().catch(() => null);
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>().catch(() => null);
  const lines = ["✅ <b>Completed job</b>", `Reference ID: ${esc(reference)}`, "", "📍Stand by | Pick up | Drop photos are all in"];
  if (info?.driver) lines.push("", `Driver: ${esc(info.driver)}`, `Tel: ${esc(info.phone || "-")}`, `Car plate: ${esc(info.plate || "-")}`);
  if (info?.returnDate && leg === "outbound") lines.push("", "Next: the second trip.");
  const replyTo = card?.telegram_message_id || undefined;
  if (photos.length >= 2) return sendPhotoAlbum(photos, lines.join("\n"), replyTo);
  if (photos.length === 1) return sendPhoto(photos[0].bytes, lines.join("\n"), replyTo);
  return sendCard(lines.join("\n"), undefined, replyTo);
}

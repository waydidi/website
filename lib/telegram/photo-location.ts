import { env } from "cloudflare:workers";
import { esc } from "./cards";
import { sendCard, telegramChatId } from "./client";
import { mapsUrl, nearestPlace } from "@/lib/place-name";

// A team member replies to a driver's step photo in the Admin group asking where it was taken
// ("Read the location and show me name or Google Maps link"): the bot answers with the place name and a Maps link.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

/** A short question about where something is (English or Thai); the reply must be to a photo, so this can be loose. */
export const isLocationQuestion = (text: string) => text.length <= 200 && /locat|where|map|place|address|coordinate|gps|ที่ไหน|พิกัด|สถานที่|ตำแหน่ง|โลเคชั่น|โลเคชัน|แผนที่|อยู่ตรงไหน/i.test(text);

/**
 * Answers a reply to a step photo posted in the Admin group. Returns true when the reply was to such a photo
 * (answered, or told it has no GPS); false when it is something else, so the normal handling carries on.
 */
export async function answerPhotoLocation(repliedMessageId: number, replyToMessageId: number): Promise<boolean> {
  const job = await db().prepare("SELECT id,booking_reference FROM telegram_delivery_jobs WHERE telegram_message_id=? AND destination=? AND status='sent' AND id LIKE 'step:%:team'")
    .bind(repliedMessageId, telegramChatId()).first<{ id: string; booking_reference: string | null }>().catch(() => null);
  if (!job) return false;
  const eventId = job.id.split(":")[1];
  const photo = await db().prepare("SELECT latitude,longitude,accuracy_metres FROM driver_trip_evidence WHERE status_event_id=? AND deleted_at IS NULL ORDER BY received_at DESC LIMIT 1")
    .bind(eventId).first<{ latitude: number | null; longitude: number | null; accuracy_metres: number | null }>().catch(() => null);
  if (photo?.latitude == null || photo.longitude == null) {
    await sendCard(`📍 No GPS location was saved with this photo${job.booking_reference ? ` (${esc(job.booking_reference)})` : ""}.`, undefined, replyToMessageId);
    return true;
  }
  const place = await nearestPlace(photo.latitude, photo.longitude);
  await sendCard([
    place ? `📍 <b>${esc(place.name)}</b>${place.address ? ` — ${esc(place.address)}` : ""}` : "📍 No named place within 150 m of the photo.",
    mapsUrl(photo.latitude, photo.longitude),
    ...(photo.accuracy_metres != null ? [`GPS accuracy ±${Math.round(photo.accuracy_metres)} m`] : []),
  ].join("\n"), undefined, replyToMessageId);
  return true;
}

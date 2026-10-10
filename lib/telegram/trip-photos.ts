import { env } from "cloudflare:workers";
import { getFile } from "@/lib/file-store";
import { ictTime } from "@/lib/evidence-rules";
import type { EvidenceRow } from "@/lib/trip-evidence";
import { esc } from "./cards";
import { sendPhoto, telegramConfigured } from "./client";

// A driver's Stand by / Pick up / Drop photo, posted to the group under the booking's card.

export const STEP_PHOTO_LABEL: Record<string, string> = { standby: "Stand by", trip_started: "Pick up", completed: "Drop" };
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

export async function postTripPhoto(input: { reference: string; status: string; driverName: string; evidence: EvidenceRow }) {
  if (!telegramConfigured()) return;
  const stored = await getFile(input.evidence.original_key);
  if (!stored) return;
  const photo = await new Response(stored.body).arrayBuffer();
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(input.reference).first<{ telegram_message_id: number }>().catch(() => null);
  const e = input.evidence;
  const gps = e.latitude !== null && e.longitude !== null
    ? `📍 <a href="https://www.google.com/maps?q=${e.latitude},${e.longitude}">${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}</a>${e.accuracy_metres ? ` ±${Math.round(e.accuracy_metres)} m` : ""}`
    : "📍 Location unavailable";
  const caption = [`📸 <b>${esc(STEP_PHOTO_LABEL[input.status] ?? input.status)}</b> · ${esc(input.reference)}`, `Driver: ${esc(input.driverName)}`, `🕒 ${esc(ictTime(e.device_captured_at))}`, gps].join("\n");
  await sendPhoto(photo, caption, card?.telegram_message_id || undefined);
}

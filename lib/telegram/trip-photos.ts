import { env } from "cloudflare:workers";
import { getFile } from "@/lib/file-store";
import { ictTime } from "@/lib/evidence-rules";
import type { EvidenceRow } from "@/lib/trip-evidence";
import { esc } from "./cards";
import { sendCard, sendPhoto, telegramConfigured, type InlineKeyboard } from "./client";

// A driver's Stand by / Pick up / Drop photo, posted to the group under the booking's card. The Drop
// carries a "Completed job" button: an admin checks the photo and confirms, which completes the job.

export const STEP_PHOTO_LABEL: Record<string, string> = { standby: "Stand by", trip_started: "Pick up", completed: "Drop" };
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
export const completedJobKeyboard = (eventId: string): InlineKeyboard => [[{ text: "✅ Completed job", callback_data: `trip_done:${eventId}` }]];

export async function postTripPhoto(input: { reference: string; status: string; eventId: string; driverName: string; evidence: EvidenceRow | null }) {
  if (!telegramConfigured()) return;
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(input.reference).first<{ telegram_message_id: number }>().catch(() => null);
  const keyboard = input.status === "completed" ? completedJobKeyboard(input.eventId) : undefined;
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

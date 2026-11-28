import { env } from "cloudflare:workers";
import { SITE_URL } from "@/lib/site";
import { listAttractions } from "@/lib/attractions";
import { sha256 } from "@/lib/security";
import { getTrip, saveSalesTripDays, tripSchema, type TripInput } from "@/lib/smart-trips";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { draftFromChat, type ModelCall } from "@/lib/trip-from-chat";
import { MAX_TRIP_DAYS } from "@/lib/trip-split";
import { customerLocale } from "./quote-rules";
import { ensureFoundationTables, logActivity } from "./activity-log";
import { salesMediaOn } from "./media-flag";

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unavailable = JSON.stringify({ ok: false, reason: "The trip could not be drafted. Hand over to staff.", handover: true });
const readyForReview = JSON.stringify({ ok: true, team_planning: true,
  instruction: "Tell the customer the Waydidi team will review the itinerary and confirm options here. Do not give a price or a link." });

/** Reuse the same checked chat-to-trip parser as the admin planner, then save the days for owner review. */
export async function requestTripPlan(conversationId: string, channel: string, input: { days: number }, call?: ModelCall): Promise<string> {
  if (!salesMediaOn() || !telegramConfigured()) return unavailable;
  const c = await db().prepare("SELECT public_id,telegram_message_id FROM website_conversations WHERE id=? AND status<>'closed' AND assigned_name IS NULL AND COALESCE(bot_paused,0)=0")
    .bind(conversationId).first<{ public_id: string | null; telegram_message_id: number | null }>();
  if (!c) return unavailable;
  const recent = (await db().prepare("SELECT rowid seq,body FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' ORDER BY rowid DESC LIMIT 40")
    .bind(conversationId).all<{ seq: number; body: string }>()).results;
  if (!recent.length) return unavailable;
  const language = customerLocale(recent[0].body);
  const id = "sales-plan-" + (await sha256(`${conversationId}:${recent[0].seq}`)).slice(0, 32);
  let saved = await getTrip(id);
  if (!saved) {
    const places = (await listAttractions()).map((a) => ({
      id: a.id, name: a.customerName || a.name, area: a.area, durationMin: a.durationMin, lat: a.latitude, lng: a.longitude, usedIn: 0,
    }));
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const result = await draftFromChat(recent.reverse().map((m) => m.body).join("\n"), places, today, call);
    if (!result.ok) return unavailable;
    const plan = result.draft;
    const requested = Number.isInteger(input.days) && input.days > 0 ? input.days : 1;
    if (requested > MAX_TRIP_DAYS) return unavailable;
    const count = Math.max(requested, plan.days ?? 1, ...plan.stops.map((stop) => stop.day ?? 1));
    const tripDate = plan.tripDate ? Date.parse(`${plan.tripDate}T12:00:00Z`) : NaN;
    const validDate = Number.isFinite(tripDate) && new Date(tripDate).toISOString().slice(0, 10) === plan.tripDate;
    const days: TripInput[] = [];
    for (let i = 0; i < count; i++) {
      days.push(tripSchema.parse({
        title: plan.title, area: plan.area, tripDate: validDate ? new Date(tripDate + i * 86_400_000).toISOString().slice(0, 10) : null,
        startTime: plan.startTime, pickupText: plan.pickupText, endText: i === count - 1 ? plan.dropoffText : null,
        durationHours: plan.durationHours, adults: plan.adults, children: plan.children, bags: plan.bags, vehicle: "comfort_suv",
        language, customerName: plan.customerName, notes: plan.notes, transportPrice: 0,
        stops: plan.stops.filter((s) => (s.day ?? 1) === i + 1),
      }));
    }
    if (!days[0]) return unavailable;
    await saveSalesTripDays(id, [days[0], ...days.slice(1)]);
    saved = await getTrip(id);
    if (!saved) return unavailable;
  }

  await ensureFoundationTables();
  const posted = await db().prepare("SELECT 1 FROM ai_activity_log WHERE dedupe_key=?").bind(`trip-plan:${id}`).first();
  if (!posted) {
    await sendCard(`<b>Itinerary draft ready</b> · ${esc(c.public_id ?? "WhatsApp")}\nReview the days, vehicle and pricing before sharing.`,
      [[{ text: "Review itinerary draft", url: `${SITE_URL}/admin/trips/${encodeURIComponent(id)}` }]], c.telegram_message_id ?? undefined);
    await logActivity({ event: "trip_plan_requested", status: "ok", actor: "assistant", channel, conversationId,
      dedupeKey: `trip-plan:${id}`, summary: "The assistant saved a private itinerary draft for owner review." });
  }
  return readyForReview;
}

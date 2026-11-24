import { env } from "cloudflare:workers";
import { SITE_URL } from "@/lib/site";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { messagesFor } from "@/lib/website-chat";
import { logActivity } from "./activity-log";

// Multi-day itineraries (F02, Sales Intelligence PR 4). On approval channels the assistant does not price tours:
// it asks the team, and the owner's card opens the existing trip planner with this chat loaded. The planner's own
// "Start from the customer's chat" step then drafts the plan; prices, opening hours and driver hours come from there.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function requestTripPlan(conversationId: string, channel: string, input: { summary: string; days: number; start_date: string }): Promise<string> {
  const told = JSON.stringify({ ok: true, team_planning: true,
    instruction: "The Waydidi team will prepare a day-by-day plan with prices and send it in this chat. Tell the customer that in one short line, and ask for anything still missing (dates, group size, hotel). Do not give prices." });
  if (!telegramConfigured()) return JSON.stringify({ ok: false, reason: "The team channel is not connected; hand over to staff.", handover: true });
  const c = await db().prepare("SELECT public_id,telegram_message_id FROM website_conversations WHERE id=?").bind(conversationId).first<{ public_id: string | null; telegram_message_id: number | null }>();
  // One card per chat every 30 minutes: the customer refining the same request doesn't flood the group.
  const recent = await db().prepare("SELECT 1 x FROM ai_activity_log WHERE event='trip_plan_requested' AND conversation_id=? AND created_at>?").bind(conversationId, new Date(Date.now() - 30 * 60_000).toISOString()).first().catch(() => null);
  if (recent) return told;
  const days = Number.isInteger(input.days) && input.days > 0 && input.days < 60 ? input.days : null;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.start_date) ? input.start_date : null;
  await sendCard([`<b>Trip planning request</b> · ${esc(c?.public_id ?? conversationId.slice(0, 8))} · ${esc(channel)}`, esc(input.summary.slice(0, 800)),
    `Days: ${days ?? "?"} · start: ${start ?? "not given"}`, "", "Open the trip planner with this chat loaded, then press “Start from the customer's chat”. The assistant gives no prices for this trip."].join("\n"),
    [[{ text: "🗺 Plan this trip", url: `${SITE_URL}/admin/trips/new?chat=${encodeURIComponent(conversationId)}` }]], c?.telegram_message_id ?? undefined);
  await logActivity({ event: "trip_plan_requested", status: "ok", actor: "assistant", channel, conversationId, summary: `Trip planning request sent to the team (${days ?? "?"} day(s))`, detail: { days, startDate: start } });
  return told;
}

/** The chat as plain text for the trip planner's "Start from the customer's chat" box (staff only; never in a URL). */
export async function chatTranscript(conversationId: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(conversationId)) return "";
  const rows = await messagesFor(conversationId, 0, 60); // oldest first
  return rows.map((m) => `${m.sender === "visitor" ? "Customer" : m.is_bot ? "Waydidi Assistant" : "Waydidi"}: ${m.body}`).join("\n").slice(-8000);
}

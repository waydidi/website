import { ensureReliabilityTables } from "@/lib/telegram/reliability-db";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";
import { sendCard, tg, telegramConfigured } from "@/lib/telegram/client";
import { esc } from "@/lib/telegram/cards";
import { ensureTelegramMessages } from "@/lib/telegram/message-store";
import { deliveryReviewSchema } from "@/lib/delivery-review-rules";
import { ensureDeliveryReviews, applyDeliveryReview, DeliveryReviewError } from "@/lib/delivery-review-db";

// Telegram team (approved Telegram users) and bot connection. Viewing is for support staff; changes are owner-only.
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function GET() {
  const staff = await getWaydidiAdmin();
  if (!staff || !["owner", "support", "operations"].includes(staff.role)) return reply("Support staff access required.", 403);
  const team = (await env.DB.prepare("SELECT t.id,t.telegram_user_id,t.telegram_username,t.display_name,t.enabled,t.staff_id,s.display_name staff_name FROM telegram_admins t LEFT JOIN staff_accounts s ON s.id=t.staff_id ORDER BY t.display_name").all()).results;
  let webhook: { url: string; pending: number; lastError: string | null } | null = null;
  let connectionError: string | null = null;
  let destination: { label: string; type: string } | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    const info = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo", {}).catch(error => { connectionError = error instanceof Error ? error.message : "Telegram could not be reached."; return null; });
    if (info) webhook = { url: info.url, pending: info.pending_update_count, lastError: info.last_error_message ?? null };
    if (telegramConfigured()) {
      const chat = await tg<{ title?: string; first_name?: string; username?: string; type: string }>("getChat", { chat_id: String(env.TELEGRAM_CHAT_ID) }).catch(error => { connectionError = error instanceof Error ? error.message : "Telegram destination could not be reached."; return null; });
      if (chat) destination = { label: chat.title ?? chat.first_name ?? chat.username ?? "Configured destination", type: chat.type };
    }
  }
  await ensureReliabilityTables();
  await ensureTelegramMessages(env.DB,"chat");
  const jobs=(await env.DB.prepare("SELECT id,booking_reference,leg,destination,status,attempts,next_attempt_at,attempted_at,last_error FROM telegram_delivery_jobs WHERE status NOT IN ('sent','cancelled') ORDER BY created_at DESC LIMIT 50").all()).results;
  const assignmentJobs=(await env.DB.prepare("SELECT n.id,n.booking_reference,a.leg,n.recipient destination,n.status,n.attempt_count attempts,n.scheduled_for next_attempt_at,n.last_attempt_at attempted_at,n.error_message last_error,'assignment' kind FROM booking_notifications n LEFT JOIN booking_assignments a ON a.id=n.assignment_id WHERE n.channel='telegram' AND n.status IN ('queued','failed','uncertain','dead_letter') ORDER BY n.created_at DESC LIMIT 50").all()).results;
  const chatJobs=(await env.DB.prepare("SELECT m.id,c.public_id booking_reference,NULL leg,a.destination,m.telegram_status status,COALESCE(a.attempts,0) attempts,p.next_attempt_at,a.attempted_at,p.last_error,'chat' kind FROM website_chat_messages m JOIN website_conversations c ON c.id=m.conversation_id LEFT JOIN telegram_chat_delivery_attempts a ON a.message_id=m.id LEFT JOIN telegram_chat_payloads p ON p.id=m.id WHERE (m.sender='visitor' OR m.is_bot=1) AND m.telegram_status IN ('pending','failed','uncertain','dead_letter') ORDER BY m.created_at DESC LIMIT 50").all()).results;
  const cancellationRequests=(await env.DB.prepare("SELECT id,booking_reference,requested_at,policy_version FROM booking_cancellation_requests WHERE status='pending' ORDER BY requested_at LIMIT 50").all()).results;
  const assistantReservations=(await env.DB.prepare("SELECT COUNT(*) count,COALESCE(SUM(reserved_microusd),0) reserved_microusd FROM telegram_assistant_reservations WHERE status='reserved'").first());
  const chatDelivery = await env.DB.prepare("SELECT telegram_status status,COUNT(*) count FROM website_chat_messages WHERE (sender='visitor' OR is_bot=1) AND telegram_status IN ('pending','failed','processing','uncertain','dead_letter') GROUP BY telegram_status").all();
  const assignmentDelivery = await env.DB.prepare("SELECT status,COUNT(*) count FROM booking_notifications WHERE channel='telegram' AND status IN ('queued','failed','uncertain','processing','dead_letter') GROUP BY status").all();
  return NextResponse.json({
    canEdit: staff.role === "owner",
    secrets: { TELEGRAM_BOT_TOKEN: Boolean(env.TELEGRAM_BOT_TOKEN), TELEGRAM_CHAT_ID: Boolean(env.TELEGRAM_CHAT_ID), TELEGRAM_WEBHOOK_SECRET: String(env.TELEGRAM_WEBHOOK_SECRET ?? "").length >= 16 },
    webhook, team, destination, connectionError, outboundReady: telegramConfigured(),
    delivery: { chat: chatDelivery.results, assignments: assignmentDelivery.results, jobs:[...jobs,...assignmentJobs,...chatJobs], cancellationRequests, assistantReservations },
  }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || staff.role !== "owner") return reply("Only the owner can change the Telegram team.", 403);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const now = new Date().toISOString();

  switch (input.action) {
    case "add": {
      const telegramUserId = String(input.telegramUserId ?? "").trim();
      const name = String(input.displayName ?? "").trim();
      if (!/^\d{3,20}$/.test(telegramUserId)) return reply("Enter the numeric Telegram ID (they can send /id in the group to see it).", 400);
      if (name.length < 2 || name.length > 60) return reply("Enter the name customers will see, like Alex.", 400);
      const staffId = typeof input.staffId === "string" && input.staffId ? input.staffId : null;
      await env.DB.prepare(`INSERT INTO telegram_admins(id,telegram_user_id,telegram_username,display_name,staff_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)
        ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,telegram_username=excluded.telegram_username,staff_id=excluded.staff_id,enabled=1,updated_at=excluded.updated_at`)
        .bind(crypto.randomUUID(), telegramUserId, String(input.username ?? "").replace(/^@/, "").slice(0, 60) || null, name, staffId, now, now).run();
      break;
    }
    case "edit": {
      const name = String(input.displayName ?? "").trim();
      if (name.length < 2 || name.length > 60) return reply("Enter the name customers will see, like Alex.", 400);
      const username = String(input.username ?? "").trim().replace(/^@/, "").slice(0, 60) || null;
      await env.DB.prepare("UPDATE telegram_admins SET display_name=?,telegram_username=?,updated_at=? WHERE id=?").bind(name, username, now, String(input.id ?? "")).run();
      break;
    }
    case "toggle":
    case "remove": {
      await ensureReliabilityTables();
      const member = await env.DB.prepare("SELECT telegram_user_id,staff_id,enabled FROM telegram_admins WHERE id=?").bind(String(input.id ?? "")).first() as {telegram_user_id:string;staff_id:string|null;enabled:number}|null;
      if (!member) return reply("Team member not found.",404);
      const revoke = input.action === "remove" || Boolean(member.enabled);
      await env.DB.batch([
        ...(revoke ? [env.DB.prepare("UPDATE website_conversations SET assigned_staff_id=NULL,assigned_telegram_user_id=NULL,assigned_name=NULL,assigned_at=NULL,updated_at=? WHERE assigned_telegram_user_id=? OR (? IS NOT NULL AND assigned_staff_id=?)").bind(now,member.telegram_user_id,member.staff_id,member.staff_id),
          env.DB.prepare("DELETE FROM telegram_dm_messages WHERE chat_id=?").bind(member.telegram_user_id),
          env.DB.prepare("UPDATE telegram_reply_prompts SET telegram_user_id=NULL WHERE telegram_user_id=?").bind(member.telegram_user_id)] : []),
        input.action === "remove" ? env.DB.prepare("DELETE FROM telegram_admins WHERE id=?").bind(String(input.id)) : env.DB.prepare("UPDATE telegram_admins SET enabled=1-enabled,updated_at=? WHERE id=?").bind(now,String(input.id)),
      ]);
      break;
    }
    case "review_delivery": {
      const parsed=deliveryReviewSchema.safeParse({requestId:input.requestId,kind:input.jobKind??"telegram",jobId:input.jobId,expectedVersion:input.expectedVersion,action:"retry",reason:input.reason,confirmedAbsent:input.confirmedAbsent});
      if(!parsed.success)return reply("Open Delivery reviews and confirm the current job version and reason.",400);
      try{
        await ensureDeliveryReviews(env.DB);
        return NextResponse.json(await applyDeliveryReview(env.DB,staff.id,parsed.data,env.NOTIFICATION_DELIVERY_RETRY==="1"),{headers});
      }catch(error){return reply(error instanceof DeliveryReviewError?error.message:"The review was not committed. Retry the same request ID.",error instanceof DeliveryReviewError?error.status:503);}
    }
    case "connect": {
      const secret = String(env.TELEGRAM_WEBHOOK_SECRET ?? "");
      if (!env.TELEGRAM_BOT_TOKEN || secret.length < 16) return reply("Add TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (16+ characters) in Cloudflare first.", 400);
      try {
        await tg("setWebhook", { url: `${safeOrigin(request)}/api/integrations/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
      } catch (error) { return reply(error instanceof Error ? error.message : "Telegram refused the webhook.", 502); }
      break;
    }
    case "test":
      if (!telegramConfigured()) return reply("Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Cloudflare first.", 400);
      try { await sendCard(`<b>WAYDIDI</b>\nTelegram is connected. Sent by ${esc(staff.displayName)} from the admin dashboard.`); }
      catch (error) { return reply(error instanceof Error ? error.message : "Telegram could not be reached.", 502); }
      break;
    default: return reply("Unknown action.", 400);
  }
  return NextResponse.json({ ok: true }, { headers });
}

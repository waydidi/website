import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";
import { sendCard, tg, telegramConfigured } from "@/lib/telegram/client";
import { esc } from "@/lib/telegram/cards";

// Telegram team (approved Telegram users) and bot connection. Viewing is for support staff; changes are owner-only.
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function GET() {
  const staff = await getWaydidiAdmin();
  if (!staff || !["owner", "support", "operations"].includes(staff.role)) return reply("Support staff access required.", 403);
  const team = (await env.DB.prepare("SELECT t.id,t.telegram_user_id,t.telegram_username,t.display_name,t.enabled,t.staff_id,s.display_name staff_name FROM telegram_admins t LEFT JOIN staff_accounts s ON s.id=t.staff_id ORDER BY t.display_name").all()).results;
  let webhook: { url: string; pending: number; lastError: string | null } | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    const info = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo", {}).catch(() => null);
    if (info) webhook = { url: info.url, pending: info.pending_update_count, lastError: info.last_error_message ?? null };
  }
  return NextResponse.json({
    canEdit: staff.role === "owner",
    secrets: { TELEGRAM_BOT_TOKEN: Boolean(env.TELEGRAM_BOT_TOKEN), TELEGRAM_CHAT_ID: Boolean(env.TELEGRAM_CHAT_ID), TELEGRAM_WEBHOOK_SECRET: String(env.TELEGRAM_WEBHOOK_SECRET ?? "").length >= 16 },
    webhook, team,
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
      await env.DB.prepare("UPDATE telegram_admins SET enabled=1-enabled,updated_at=? WHERE id=?").bind(now, String(input.id ?? "")).run();
      break;
    case "remove":
      await env.DB.prepare("DELETE FROM telegram_admins WHERE id=?").bind(String(input.id ?? "")).run();
      break;
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

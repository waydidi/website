import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { ceeEnabled, setCeeEnabled } from "@/lib/cee/bot";
import { addStaffMessage, assign, pauseBot, conversationById, deliverVisitorMessage, messagesFor, setStatus, STATUSES } from "@/lib/website-chat";
import type { ChatStatus } from "@/lib/telegram/cards";

const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const allowed = (role: string) => ["owner", "support", "operations"].includes(role);

// "Unread" = customer messages after the last staff reply.
// "Unread" = customer messages after the last staff reply and after the last time any admin opened the chat.
const UNREAD = `(SELECT COUNT(*) FROM website_chat_messages m WHERE m.conversation_id=c.id AND m.sender='visitor'
  AND m.rowid>MAX(c.read_seq,COALESCE((SELECT MAX(rowid) FROM website_chat_messages WHERE conversation_id=c.id AND sender='staff' AND is_bot=0),0)))`;

export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Support staff access required.", 403);
  const url = new URL(request.url), now = new Date().toISOString();

  if (url.searchParams.get("summary") === "1") {
    const rows = (await env.DB.prepare(`SELECT c.id,c.public_id,${UNREAD} unread,
      (SELECT id FROM website_chat_messages WHERE conversation_id=c.id AND sender='visitor' ORDER BY rowid DESC LIMIT 1) message_id
      FROM website_conversations c WHERE c.expires_at>? AND c.status<>'closed' GROUP BY c.id HAVING unread>0 ORDER BY c.last_message_at DESC LIMIT 100`).bind(now).all()).results as { id: string; public_id: string; unread: number; message_id: string }[];
    return NextResponse.json({ items: rows.map((c) => ({ key: `chat:${c.message_id}`, n: c.unread, text: `customer ${c.unread === 1 ? "message" : "messages"} waiting · ${c.public_id}`, href: `/admin/chat?id=${encodeURIComponent(c.id)}`, urgent: true })) }, { headers });
  }

  const status = url.searchParams.get("status") ?? "active";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const filters: string[] = ["c.expires_at>?"], binds: unknown[] = [now];
  if (status === "active") filters.push("c.status<>'closed'");
  else if ((STATUSES as string[]).includes(status)) { filters.push("c.status=?"); binds.push(status); }
  if (url.searchParams.get("mine") === "1") { filters.push("c.assigned_staff_id=?"); binds.push(staff.id); }
  if (url.searchParams.get("unassigned") === "1") filters.push("c.assigned_name IS NULL");
  if (q) {
    filters.push(`(c.public_id LIKE ?1q OR c.customer_name LIKE ?1q OR c.customer_email LIKE ?1q OR c.customer_phone LIKE ?1q OR EXISTS(SELECT 1 FROM website_chat_messages s WHERE s.conversation_id=c.id AND s.body LIKE ?1q))`.replace(/\?1q/g, "?"));
    for (let i = 0; i < 5; i++) binds.push(`%${q}%`);
  }
  const conversations = (await env.DB.prepare(`SELECT c.id,c.public_id,c.status,c.channel,c.customer_name,c.customer_email,c.source_title,c.source_url,c.assigned_name,c.assigned_staff_id,c.last_message_at,c.updated_at,c.follow_up_at,c.read_by,c.read_at,${UNREAD} unread,
    (SELECT body FROM website_chat_messages WHERE conversation_id=c.id ORDER BY rowid DESC LIMIT 1) preview,
    (SELECT sender FROM website_chat_messages WHERE conversation_id=c.id ORDER BY rowid DESC LIMIT 1) last_sender
    FROM website_conversations c WHERE ${filters.join(" AND ")} ORDER BY COALESCE(c.last_message_at,c.updated_at) DESC LIMIT 100`).bind(...binds).all()).results;

  const id = url.searchParams.get("id");
  let conversation = null, messages: unknown[] = [], selectionError: string | null = null;
  if (id) {
    const c = await conversationById(id);
    if (!c || c.expires_at <= now) selectionError = "That chat has expired or is unavailable. Choose another conversation.";
    else {
      conversation = { id: c.id, public_id: c.public_id, status: c.status, customer_name: c.customer_name, customer_email: c.customer_email, customer_phone: c.customer_phone,
        customer_id: c.customer_id, customer_country: c.customer_country ?? null, source_url: c.source_url, source_title: c.source_title, topic: c.topic, assigned_name: c.assigned_name, assigned_staff_id: c.assigned_staff_id,
        created_at: c.created_at, last_message_at: c.last_message_at,
        // No messages for 15 minutes: the inbox offers "Completed" / "Follow up".
        quiet: Boolean(c.last_message_at && Date.parse(now) - Date.parse(c.last_message_at) >= 15 * 60 * 1000), follow_up_at: (c as { follow_up_at?: string | null }).follow_up_at ?? null, on_telegram: Boolean(c.telegram_message_id), bot_paused: Boolean((c as { bot_paused?: number }).bot_paused) };
      messages = await messagesFor(c.id);
      // Opening a chat marks it read for the whole team (badge and bell clear on every device).
      const latest = (messages as { seq: number; sender: string }[]).filter((m) => m.sender === "visitor").at(-1)?.seq ?? 0;
      if (latest > ((c as { read_seq?: number }).read_seq ?? 0)) {
        await env.DB.prepare("UPDATE website_conversations SET read_seq=MAX(read_seq,?),read_by=?,read_at=? WHERE id=?").bind(latest, staff.displayName, now, c.id).run();
        Object.assign(conversation!, { read_by: staff.displayName, read_at: now, read_seq: latest });
      } else Object.assign(conversation!, { read_by: (c as { read_by?: string | null }).read_by ?? null, read_at: (c as { read_at?: string | null }).read_at ?? null, read_seq: (c as { read_seq?: number }).read_seq ?? 0 });
    }
  }
  const team = (await env.DB.prepare("SELECT id,display_name name FROM staff_accounts WHERE active=1 AND role IN ('owner','support','operations') ORDER BY display_name").all().catch(() => ({ results: [] }))).results;
  return NextResponse.json({ conversations, conversation, messages, selectionError, team, me: { id: staff.id, name: staff.displayName },
    cee: { enabled: await ceeEnabled(), keySet: Boolean((env as unknown as Record<string, unknown>).ANTHROPIC_API_KEY) } }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Support staff access required.", 403);
  const input = await request.json().catch(() => null) as { action?: unknown; id?: unknown; message?: unknown; status?: unknown; staffId?: unknown; messageId?: unknown; on?: unknown } | null;
  // Global Non switch: owner only.
  if (input?.action === "cee_enabled") {
    if (staff.role !== "owner") return reply("Only the owner can switch Non on or off.", 403);
    await setCeeEnabled(input.on === true);
    return NextResponse.json({ ok: true }, { headers });
  }
  if (typeof input?.id !== "string" || !input.id || input.id.length > 100) return reply("Choose a conversation.", 400);
  const c = await conversationById(input.id);
  if (!c || c.expires_at <= new Date().toISOString()) return reply("Conversation expired or unavailable.", 404);
  const me = { name: staff.displayName, staffId: staff.id };

  switch (input.action ?? "reply") {
    case "reply": {
      if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000) return reply("Write a reply of up to 2,000 characters.", 400);
      // Replying is open to the assignee; anyone else must take the chat over explicitly first.
      if (c.assigned_name && c.assigned_staff_id !== staff.id) return reply(`${c.assigned_name} is handling this chat. Use “Assign to me” to take it over.`, 409);
      await addStaffMessage(c.id, input.message.trim(), me, "dashboard");
      break;
    }
    case "assign": {
      // Explicit reassignment from the dashboard (to yourself or another support admin).
      let target = me;
      if (typeof input.staffId === "string" && input.staffId !== staff.id) {
        const other = await env.DB.prepare("SELECT id,display_name FROM staff_accounts WHERE id=? AND active=1 AND role IN ('owner','support','operations')").bind(input.staffId).first() as { id: string; display_name: string } | null;
        if (!other) return reply("Choose an active support admin.", 400);
        target = { name: other.display_name, staffId: other.id };
      }
      await assign(c.id, target, true);
      break;
    }
    case "unassign":
      await env.DB.prepare("UPDATE website_conversations SET assigned_staff_id=NULL,assigned_telegram_user_id=NULL,assigned_name=NULL,assigned_at=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), c.id).run();
      await import("@/lib/website-chat").then((m) => m.refreshCard(c.id, true)).catch(() => undefined);
      break;
    case "status":
      if (!(STATUSES as unknown[]).includes(input.status)) return reply("Unknown status.", 400);
      await setStatus(c.id, input.status as ChatStatus);
      break;
    case "retry_telegram":
      if (typeof input.messageId !== "string") return reply("Choose a message.", 400);
      try { await deliverVisitorMessage(c.id, input.messageId); } catch { return reply("Telegram is still unavailable. It will retry automatically.", 502); }
      break;
    // Quiet chat: finish it, or keep it for a later follow-up (customer still deciding).
    case "complete":
      await env.DB.prepare("UPDATE website_conversations SET follow_up_at=NULL WHERE id=?").bind(c.id).run();
      await setStatus(c.id, "closed");
      break;
    case "follow_up":
      await env.DB.prepare("UPDATE website_conversations SET follow_up_at=? WHERE id=?").bind(new Date().toISOString(), c.id).run();
      await setStatus(c.id, "pending");
      break;
    case "cee_pause": await pauseBot(c.id, true); break;
    case "cee_resume": await pauseBot(c.id, false); break;
    default: return reply("Unknown chat action.", 400);
  }
  return NextResponse.json({ ok: true }, { headers });
}

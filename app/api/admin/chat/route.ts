import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { CHAT_MESSAGE_SELECT, ensureChatAssignments } from "@/lib/website-chat";

const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || !["owner", "support", "operations"].includes(staff.role)) return reply("Support staff access required.", 403);
  await ensureChatAssignments(env.DB);
  const id = new URL(request.url).searchParams.get("id");
  const now = new Date().toISOString();
  const conversations = (await env.DB.prepare(`SELECT c.id,c.updated_at,a.staff_id,a.staff_name,
    (SELECT body FROM website_chat_messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) preview,
    (SELECT sender FROM website_chat_messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) last_sender
    FROM website_conversations c LEFT JOIN website_chat_assignments a ON a.conversation_id=c.id
    WHERE c.expires_at>? ORDER BY c.updated_at DESC,c.id LIMIT 100`).bind(now).all()).results;
  let messages: unknown[] = [], conversation = null;
  if (id) {
    conversation = await env.DB.prepare(`SELECT c.id,a.staff_id,a.staff_name FROM website_conversations c
      LEFT JOIN website_chat_assignments a ON a.conversation_id=c.id WHERE c.id=? AND c.expires_at>?`).bind(id, now).first();
    if (!conversation) return reply("Conversation expired or unavailable.", 404);
    messages = (await env.DB.prepare(`${CHAT_MESSAGE_SELECT} WHERE m.conversation_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 200`).bind(id).all()).results.reverse();
  }
  return NextResponse.json({ conversations, conversation, messages, me: { id: staff.id, name: staff.displayName } }, { headers });
}
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !["owner", "support", "operations"].includes(staff.role)) return reply("Support staff access required.", 403);
  const input = await request.json().catch(() => null) as { action?: unknown; id?: unknown; message?: unknown; name?: unknown } | null;
  if (typeof input?.id !== "string" || !input.id || input.id.length > 100) return reply("Choose a conversation.", 400);
  await ensureChatAssignments(env.DB);
  const now = new Date().toISOString();
  if (input.action === "assign") {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length < 2 || name.length > 100) return reply("Enter your name (2–100 characters) before joining the chat.", 400);
    const result = await env.DB.prepare(`INSERT INTO website_chat_assignments(conversation_id,staff_id,staff_name,assigned_at)
      SELECT id,?,?,? FROM website_conversations WHERE id=? AND expires_at>?
      ON CONFLICT(conversation_id) DO NOTHING`).bind(staff.id, name, now, input.id, now).run();
    if (!result.meta.changes) {
      const current = await env.DB.prepare("SELECT staff_id FROM website_chat_assignments WHERE conversation_id=?").bind(input.id).first() as { staff_id: string } | null;
      if (!current) return reply("Conversation expired or unavailable.", 404);
      if (current.staff_id !== staff.id) return reply("Another admin is already assigned to this chat.", 409);
    }
    return NextResponse.json({ ok: true }, { headers });
  }
  if (input.action !== undefined && input.action !== "reply") return reply("Unknown chat action.", 400);
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000) return reply("Write a reply of up to 2,000 characters.", 400);
  const result = await env.DB.prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at)
    SELECT ?,c.id,'staff',?,?,? FROM website_conversations c
    JOIN website_chat_assignments a ON a.conversation_id=c.id
    JOIN staff_accounts s ON s.id=a.staff_id AND s.active=1
    WHERE c.id=? AND c.expires_at>? AND a.staff_id=?`).bind(crypto.randomUUID(), input.message.trim(), staff.id, now, input.id, now, staff.id).run();
  if (!result.meta.changes) return reply("Assign yourself to this chat before replying. Only the assigned admin can send replies.", 409);
  await env.DB.prepare("UPDATE website_conversations SET updated_at=? WHERE id=?").bind(now, input.id).run();
  return NextResponse.json({ ok: true }, { headers });
}

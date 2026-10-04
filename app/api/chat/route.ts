import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { readCookie } from "@/lib/staff-security";
import { isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";
import { googleReviewUrl, reviewForConversation } from "@/lib/support-reviews";
import { addVisitorMessage, conversationByTokenHash, createConversation, messagesFor, type Conversation } from "@/lib/website-chat";

// Customer side of the chat. The httpOnly cookie token is the only key to a conversation;
// the WD-number shown to staff never grants access.
const COOKIE = "waydidi_chat";
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

async function current(request: Request) {
  const token = readCookie(request, COOKIE);
  return /^[a-f0-9]{48}$/.test(token) ? conversationByTokenHash(await sha256(token)) : null;
}
const view = (c: Conversation) => ({ publicId: c.public_id, status: c.status, agent: c.assigned_name, name: c.customer_name });
/** Review state for a closed chat: whether it's been rated, and the Google link (shown to everyone). */
async function reviewState(c: Conversation) {
  if (c.status !== "closed") return null;
  const r = await reviewForConversation(c.id);
  return { submitted: Boolean(r), rating: r?.rating ?? null, googleUrl: googleReviewUrl() };
}

export async function GET(request: Request) {
  const c = await current(request);
  if (!c) return NextResponse.json({ conversation: null, messages: [] }, { headers });
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after")) || 0);
  // Visitors see staff by their display name only, never staff ids or Telegram details.
  const messages = (await messagesFor(c.id, after)).map((m) => ({ seq: m.seq, id: m.id, sender: m.sender, name: m.sender === "staff" ? m.sender_name : null, body: m.body, createdAt: m.created_at, clientId: m.client_id }));
  return NextResponse.json({ conversation: { ...view(c), review: await reviewState(c) }, messages }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return fail("Request blocked", 403);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message || message.length > 2000) return fail("Write a message of up to 2,000 characters.", 400);
  const clientId = typeof input.clientId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(input.clientId) ? input.clientId : null;

  const window = Math.floor(Date.now() / 900000), fingerprint = await sha256(`chat:${env.RATE_LIMIT_SALT ?? "waydidi"}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
  const attempt = await env.DB.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 WHERE attempts<20 RETURNING attempts").bind(fingerprint, window).first();
  if (!attempt) return fail("Please wait a few minutes before sending more messages.", 429);

  let c = await current(request), token: string | null = null;
  // A finished (closed) chat stays as it was rated; a new message starts a fresh conversation.
  const previous = c?.status === "closed" ? c : null;
  if (previous) c = null;
  if (!c) {
    token = secureToken();
    const signedIn = await customerFromRequest(request).catch(() => null);
    const account = signedIn?.customer;
    const source = text(input.sourceUrl, 300);
    // An email is required to start a chat, so staff can always follow up.
    const email = text(input.email, 254) ?? previous?.customer_email ?? account?.email ?? null;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return fail("Enter your email address to start the chat.", 400);
    c = await createConversation(await sha256(token), {
      customerId: account?.id ?? previous?.customer_id ?? null,
      phone: text(input.phone, 40) ?? previous?.customer_phone ?? account?.phone ?? null,
      name: text(input.name, 100) ?? previous?.customer_name ?? (account ? `${account.name ?? ""} ${account.surname ?? ""}`.trim() || null : null),
      email,
      sourceUrl: source && source.startsWith("/") ? source : null,
      sourceTitle: text(input.sourceTitle, 160), topic: text(input.topic, 60),
      // Set by Cloudflare from the visitor's IP; "XX"/"T1" mean unknown or Tor.
      country: /^[A-Z]{2}$/.test(request.headers.get("cf-ipcountry") ?? "") && !["XX", "T1"].includes(request.headers.get("cf-ipcountry")!) ? request.headers.get("cf-ipcountry") : null,
    });
  }
  const result = await addVisitorMessage(c, message, clientId);
  const response = NextResponse.json({ ok: true, duplicate: result.duplicate, conversation: view(c) }, { headers });
  if (token) response.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 30 * 86400 });
  return response;
}

/** Optional contact details, added after the first message. */
export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return fail("Request blocked", 403);
  const c = await current(request);
  if (!c) return fail("Start the chat first.", 404);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = text(input.email, 254);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email.", 400);
  await env.DB.prepare("UPDATE website_conversations SET customer_name=COALESCE(?,customer_name),customer_email=COALESCE(?,customer_email),customer_phone=COALESCE(?,customer_phone),updated_at=? WHERE id=?")
    .bind(text(input.name, 100), email, text(input.phone, 40), new Date().toISOString(), c.id).run();
  await import("@/lib/website-chat").then((m) => m.refreshCard(c.id)).catch(() => undefined);
  return NextResponse.json({ ok: true }, { headers });
}

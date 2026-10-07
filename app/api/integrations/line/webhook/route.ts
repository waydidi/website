import { receiveChannelMessage } from "@/lib/channels/inbound";
import { lineConfigured, lineDisplayName, validLineSignature } from "@/lib/channels";

// LINE Messaging API webhook.
type Payload = { events?: { type: string; webhookEventId?: string; replyToken?: string; source?: { type?: string; userId?: string }; message?: { id: string; type: string; text?: string; latitude?: number; longitude?: number; title?: string; address?: string } }[] };

export async function POST(request: Request) {
  if (!lineConfigured()) return new Response("Not configured", { status: 404 });
  const raw = await request.text();
  if (!(await validLineSignature(raw, request.headers.get("x-line-signature")))) return new Response("Bad signature", { status: 401 });
  let payload: Payload;
  try { payload = JSON.parse(raw || "{}"); } catch { return new Response("Invalid JSON", { status: 400 }); }
  let failed = false;
  for (const e of payload.events ?? []) {
    // One-to-one chats only; group chats with the bot are ignored.
    if (e.type !== "message" || !e.message || e.source?.type !== "user" || !e.source.userId) continue;
    const m = e.message;
    const text = m.type === "location" && m.latitude !== undefined && m.longitude !== undefined
      ? `📍 My location: ${m.latitude.toFixed(5)},${m.longitude.toFixed(5)}${m.title || m.address ? ` (${[m.title, m.address].filter(Boolean).join(", ")})` : ""}`
      : e.message.type === "text" ? e.message.text ?? "" : `[${e.message.type} message. Photos, stickers and files aren't read by Non yet; please type your question.]`;
    await receiveChannelMessage({ channel: "line", userId: e.source.userId, messageId: e.message.id, text, name: await lineDisplayName(e.source.userId), lineReplyToken: e.replyToken ?? null })
      .catch((err) => { failed = true; console.error("line inbound failed", err instanceof Error ? err.message : "unknown"); });
  }
  return new Response(failed ? "Retry later" : "ok", { status: failed ? 503 : 200 });
}

import { receiveChannelMessage } from "@/lib/channels/inbound";
import { lineConfigured, lineDisplayName, validLineSignature } from "@/lib/channels";

// LINE Messaging API webhook.
type Payload = { events?: { type: string; webhookEventId?: string; source?: { type?: string; userId?: string }; message?: { id: string; type: string; text?: string } }[] };

export async function POST(request: Request) {
  if (!lineConfigured()) return new Response("Not configured", { status: 404 });
  const raw = await request.text();
  if (!(await validLineSignature(raw, request.headers.get("x-line-signature")))) return new Response("Bad signature", { status: 401 });
  const payload = JSON.parse(raw || "{}") as Payload;
  for (const e of payload.events ?? []) {
    // One-to-one chats only; group chats with the bot are ignored.
    if (e.type !== "message" || !e.message || e.source?.type !== "user" || !e.source.userId) continue;
    const text = e.message.type === "text" ? e.message.text ?? "" : `[${e.message.type} message. Photos, stickers and files aren't read by Cee yet; please type your question.]`;
    await receiveChannelMessage({ channel: "line", userId: e.source.userId, messageId: e.message.id, text, name: await lineDisplayName(e.source.userId) })
      .catch((err) => console.error("line inbound failed", err instanceof Error ? err.message : "unknown"));
  }
  return new Response("ok");
}

import { env } from "cloudflare:workers";
import { receiveChannelMessage } from "@/lib/channels/inbound";
import { validWhatsappSignature, whatsappConfigured } from "@/lib/channels";
import { logActivity } from "@/lib/sales-ai/activity-log";
import { recordDeliveryStatus, recordWhatsappMedia } from "@/lib/sales-ai/channel-events";
import { whatsappMediaRef } from "@/lib/sales-ai/whatsapp-rules";
import { mediaReadingEnabled, readAttachment } from "@/lib/sales-ai/media-reader";

// Meta WhatsApp Cloud API webhook. GET is Meta's one-time verification; POST carries messages and
// delivery statuses. Everything is saved before the 200; any failure answers 503 so Meta retries,
// and every write is keyed by Meta's ids, so a retry never duplicates a message, media record or status.
export async function GET(request: Request) {
  const url = new URL(request.url), token = (env as unknown as Record<string, string | undefined>).WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

type Message = { from: string; id: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; location?: { latitude?: number; longitude?: number; name?: string; address?: string } } & Record<string, unknown>;
type Status = { id?: string; status?: string; errors?: { code?: number | string }[] };
type Payload = { entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: Message[]; statuses?: Status[] } }[] }[] };

const MEDIA_PLACEHOLDER = (type: string) => `[${type} message. Photos, voice notes and files aren't read by Waydidi Assistant yet; please type your question.]`;

export async function POST(request: Request) {
  if (!whatsappConfigured()) return new Response("Not configured", { status: 404 });
  const raw = await request.text();
  if (!(await validWhatsappSignature(raw, request.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
  let payload: Payload;
  try { payload = JSON.parse(raw || "{}"); } catch { return new Response("Invalid JSON", { status: 400 }); }
  let failed = false;
  const fail = (what: string) => (e: unknown) => { failed = true; console.error(`whatsapp ${what} failed`, e instanceof Error ? e.message : "unknown"); };
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const v = change.value;
    for (const msg of v?.messages ?? []) {
      if (typeof msg.id !== "string" || typeof msg.from !== "string") continue;
      const name = v?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
      const pin = msg.location?.latitude !== undefined && msg.location.longitude !== undefined
        ? `📍 My location: ${msg.location.latitude.toFixed(5)},${msg.location.longitude.toFixed(5)}${msg.location.name || msg.location.address ? ` (${[msg.location.name, msg.location.address].filter(Boolean).join(", ")})` : ""}` : null;
      const media = whatsappMediaRef(msg);
      // SALES_AI_MEDIA=1: photos and PDFs are read (bounded time, once per file) before the message is saved,
      // so the assistant sees the facts. Anything that goes wrong falls back to the plain placeholder.
      const read = media && mediaReadingEnabled() ? await readAttachment(media) : null;
      const placeholder = read ?? MEDIA_PLACEHOLDER(msg.type);
      const text = pin ?? msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
        ?? (media?.caption ? `${media.caption}\n${placeholder}` : placeholder);
      const saved = await receiveChannelMessage({ channel: "whatsapp", userId: msg.from, messageId: msg.id, text, name, phone: `+${msg.from}` }).catch(fail("inbound"));
      if (!saved) continue;
      await logActivity({ event: "inbound_message", status: "ok", actor: "whatsapp", channel: "whatsapp", conversationId: saved.conversationId, dedupeKey: `wa-in:${msg.id}`,
        summary: `Customer message (${msg.type})`, detail: { type: msg.type } });
      if (media) await recordWhatsappMedia(media, msg.id, saved.conversationId).catch(fail("media"));
    }
    for (const s of v?.statuses ?? []) {
      if (typeof s.id !== "string" || typeof s.status !== "string") continue;
      const code = s.errors?.[0]?.code;
      await recordDeliveryStatus(s.id, s.status, code == null ? null : String(code)).catch(fail("status"));
    }
  }
  return new Response(failed ? "Retry later" : "ok", { status: failed ? 503 : 200 });
}

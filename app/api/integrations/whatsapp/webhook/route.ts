import { env } from "cloudflare:workers";
import { receiveChannelMessage } from "@/lib/channels/inbound";
import { validWhatsappSignature, whatsappConfigured } from "@/lib/channels";

// Meta WhatsApp Cloud API webhook. GET is Meta's one-time verification; POST carries messages.
export async function GET(request: Request) {
  const url = new URL(request.url), token = (env as unknown as Record<string, string | undefined>).WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

type Payload = { entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { from: string; id: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; location?: { latitude?: number; longitude?: number; name?: string; address?: string } }[] } }[] }[] };

export async function POST(request: Request) {
  if (!whatsappConfigured()) return new Response("Not configured", { status: 404 });
  const raw = await request.text();
  if (!(await validWhatsappSignature(raw, request.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
  let payload: Payload;
  try { payload = JSON.parse(raw || "{}"); } catch { return new Response("Invalid JSON", { status: 400 }); }
  let failed = false;
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const v = change.value;
    for (const msg of v?.messages ?? []) {
      const name = v?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
      const pin = msg.location?.latitude !== undefined && msg.location.longitude !== undefined
        ? `📍 My location: ${msg.location.latitude.toFixed(5)},${msg.location.longitude.toFixed(5)}${msg.location.name || msg.location.address ? ` (${[msg.location.name, msg.location.address].filter(Boolean).join(", ")})` : ""}` : null;
      const text = pin ?? msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
        ?? `[${msg.type} message. Photos, voice notes and files aren't read by Non yet; please type your question.]`;
      await receiveChannelMessage({ channel: "whatsapp", userId: msg.from, messageId: msg.id, text, name, phone: `+${msg.from}` }).catch((e) => { failed = true; console.error("whatsapp inbound failed", e instanceof Error ? e.message : "unknown"); });
    }
  }
  return new Response(failed ? "Retry later" : "ok", { status: failed ? 503 : 200 });
}

import { env } from "cloudflare:workers";
import { receiveChannelMessage } from "@/lib/channels/inbound";
import { validWhatsappSignature, whatsappConfigured } from "@/lib/channels";

// Meta WhatsApp Cloud API webhook. GET is Meta's one-time verification; POST carries messages.
export async function GET(request: Request) {
  const url = new URL(request.url), token = (env as unknown as Record<string, string | undefined>).WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

type Payload = { entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { from: string; id: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[] } }[] }[] };

export async function POST(request: Request) {
  if (!whatsappConfigured()) return new Response("Not configured", { status: 404 });
  const raw = await request.text();
  if (!(await validWhatsappSignature(raw, request.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
  const payload = JSON.parse(raw || "{}") as Payload;
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const v = change.value;
    for (const msg of v?.messages ?? []) {
      const name = v?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
      const text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
        ?? `[${msg.type} message. Photos, voice notes and files aren't read by Cee yet; please type your question.]`;
      await receiveChannelMessage({ channel: "whatsapp", userId: msg.from, messageId: msg.id, text, name, phone: `+${msg.from}` }).catch((e) => console.error("whatsapp inbound failed", e instanceof Error ? e.message : "unknown"));
    }
  }
  return new Response("ok"); // always 200 quickly so Meta doesn't retry a handled message
}

import { env } from "cloudflare:workers";

// WhatsApp (Meta Cloud API) and LINE (Messaging API): the same chat, Cee and inbox as the website;
// these are only the doors in and out. Keys live in Cloudflare secrets, never in the code.

export type Channel = "web" | "whatsapp" | "line";
const vars = () => env as unknown as Record<string, string | undefined>;
export const CHANNEL_LABEL: Record<Channel, string> = { web: "Website", whatsapp: "WhatsApp", line: "LINE" };

export const whatsappConfigured = () => Boolean(vars().WHATSAPP_TOKEN && vars().WHATSAPP_PHONE_NUMBER_ID && vars().WHATSAPP_APP_SECRET && vars().WHATSAPP_VERIFY_TOKEN);
export const lineConfigured = () => Boolean(vars().LINE_CHANNEL_ACCESS_TOKEN && vars().LINE_CHANNEL_SECRET);

const GRAPH = "https://graph.facebook.com/v21.0";
async function whatsapp(body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${vars().WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${vars().WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const out = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`WhatsApp: ${out.error?.message ?? res.status}`);
  return out.messages?.[0]?.id ?? null;
}
async function line(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.line.me/v2/bot/${path}`, {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${vars().LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

/** Sends a staff or Cee message to the customer's WhatsApp/LINE. Website chats need nothing. */
export async function deliverToChannel(channel: string | null | undefined, userId: string | null | undefined, text: string) {
  if (!userId) return null;
  if (channel === "whatsapp" && whatsappConfigured())
    // WhatsApp allows free-form replies within 24 hours of the customer's last message.
    return whatsapp({ to: userId, type: "text", text: { body: text.slice(0, 4096), preview_url: true } });
  if (channel === "line" && lineConfigured()) { await line("message/push", { to: userId, messages: [{ type: "text", text: text.slice(0, 5000) }] }); return null; }
  return null;
}

/** "Typing…" on the customer's phone while Cee works (and marks their message read on WhatsApp). */
export async function showTyping(channel: string, userId: string, messageId: string | null) {
  if (channel === "whatsapp" && whatsappConfigured() && messageId) await whatsapp({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });
  if (channel === "line" && lineConfigured()) await line("chat/loading/start", { chatId: userId, loadingSeconds: 20 });
}

export async function lineDisplayName(userId: string) {
  if (!lineConfigured()) return null;
  const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${vars().LINE_CHANNEL_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  return res?.ok ? ((await res.json()) as { displayName?: string }).displayName ?? null : null;
}

const enc = new TextEncoder();
async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
/** Meta signs webhooks with X-Hub-Signature-256: "sha256=<hex>". */
export async function validWhatsappSignature(body: string, header: string | null) {
  const secret = vars().WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const hex = [...await hmac(secret, body)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return same(header, `sha256=${hex}`);
}
/** LINE signs webhooks with x-line-signature: base64 HMAC-SHA256. */
export async function validLineSignature(body: string, header: string | null) {
  const secret = vars().LINE_CHANNEL_SECRET;
  if (!secret || !header) return false;
  return same(header, btoa(String.fromCharCode(...await hmac(secret, body))));
}

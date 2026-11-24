// Pure WhatsApp Cloud API rules: the customer-service window, delivery-status ordering and media references.

/** Free-form messages are allowed only within 24 hours of the customer's latest message (Meta's rule). */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Evaluated at send time from the stored time of the customer's latest inbound message. */
export function whatsappWindowOpen(lastInboundIso: string | null | undefined, now = Date.now()) {
  if (!lastInboundIso) return false;
  const at = Date.parse(lastInboundIso);
  // A timestamp in the future is a clock or data error: treat the window as closed.
  return Number.isFinite(at) && at <= now + 60_000 && now - at < WHATSAPP_WINDOW_MS;
}

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";
const RANK: Record<DeliveryStatus, number> = { sent: 1, delivered: 2, read: 3, failed: 0 };
export const isDeliveryStatus = (s: unknown): s is DeliveryStatus => typeof s === "string" && s in RANK;

/**
 * Webhook statuses can arrive late or out of order. Status only moves forward (sent -> delivered -> read);
 * "failed" applies only before the message is known to be delivered. Returns the status to store, or null.
 */
export function nextDeliveryStatus(current: DeliveryStatus | null | undefined, incoming: DeliveryStatus): DeliveryStatus | null {
  if (!current) return incoming;
  if (current === incoming) return null;
  if (incoming === "failed") return current === "sent" ? "failed" : null;
  if (current === "failed") return null;
  return RANK[incoming] > RANK[current] ? incoming : null;
}

export const MEDIA_KINDS = ["image", "document", "audio", "video", "sticker"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaRef = { kind: MediaKind; mediaId: string; mimeType: string | null; sha256: string | null; caption: string | null };

type RawMedia = { id?: unknown; mime_type?: unknown; sha256?: unknown; caption?: unknown };
const MEDIA_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MIME = /^[a-z]+\/[a-z0-9.+-]{1,80}(?:;\s*[a-z0-9=._ -]{1,60})?$/i;
const SHA = /^[A-Za-z0-9+/=_-]{16,100}$/;

/** A media message as a validated reference (nothing is downloaded). Unknown or malformed parts become null. */
export function whatsappMediaRef(msg: { type?: unknown } & Record<string, unknown>): MediaRef | null {
  const kind = MEDIA_KINDS.find((k) => k === msg.type);
  if (!kind) return null;
  const m = (msg[kind] ?? {}) as RawMedia;
  if (typeof m.id !== "string" || !MEDIA_ID.test(m.id)) return null;
  const mimeType = typeof m.mime_type === "string" && MIME.test(m.mime_type) ? m.mime_type.toLowerCase() : null;
  const sha256 = typeof m.sha256 === "string" && SHA.test(m.sha256) ? m.sha256 : null;
  const caption = typeof m.caption === "string" && m.caption.trim() ? m.caption.trim().slice(0, 1000) : null;
  return { kind, mediaId: m.id, mimeType, sha256, caption };
}

/** ASSISTANT_DISABLED_CHANNELS="whatsapp,line": channels where Waydidi Assistant must not answer (staff replies still work). */
export function disabledChannels(value: string | undefined | null): Set<string> {
  return new Set((value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => ["web", "whatsapp", "line"].includes(s)));
}

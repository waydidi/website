import type { InlineKeyboard } from "./client";
import { countryLabel } from "../country";

// Rich-card presentation for Telegram (HTML parse mode). Business logic never builds Telegram text itself.

export const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (value: string, max = 600) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));

export type ChatStatus = "open" | "pending" | "closed";
export const STATUS_LABEL: Record<ChatStatus, string> = { open: "🟢 Open", pending: "🟡 Pending", closed: "⚪ Closed" };

export type CardConversation = {
  customer_country?: string | null;
  id: string; public_id: string; status: ChatStatus; customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  source_title: string | null; source_url: string | null; topic: string | null; assigned_name: string | null; created_at: string;
};

export function conversationCard(c: CardConversation, latest: { body: string; created_at: string; from: string } | null, fresh: boolean) {
  const lines = [
    "🟠 <b>WAYDIDI</b>",
    fresh ? "💬 <b>NEW WEBSITE CHAT</b>" : `💬 <b>Conversation ${esc(c.public_id)}</b>`,
    "",
    `👤 <b>${esc(c.customer_name || "Website visitor")}</b>`,
    ...(countryLabel(c.customer_country) ? [`📍 ${esc(countryLabel(c.customer_country))}`] : []),
    ...(c.customer_phone ? [`📞 ${esc(c.customer_phone)}`] : []),
    ...(c.customer_email ? [`✉️ ${esc(c.customer_email)}`] : []),
    ...(fresh ? [`🆔 ${esc(c.public_id)}`] : []),
    ...(c.source_title || c.source_url ? [`🌐 ${esc(c.source_title || c.source_url)}`] : []),
    ...(c.topic ? [`🏷 ${esc(c.topic)}`] : []),
    `🕒 ${esc(time(c.created_at))}`,
    c.assigned_name ? `🔵 Assigned to <b>${esc(c.assigned_name)}</b>` : "👨‍💼 Unassigned",
    STATUS_LABEL[c.status],
    ...(latest ? ["", `${latest.from === "visitor" ? "Customer" : esc(latest.from)}:`, `<blockquote>${esc(clip(latest.body))}</blockquote>`] : []),
    "",
    "<i>Reply to this card (swipe ←) to answer the customer.</i>",
  ];
  return lines.join("\n");
}

export function conversationKeyboard(c: CardConversation, adminUrl: string): InlineKeyboard {
  const id = c.id;
  if (c.status === "closed") return [[{ text: "↩️ Reopen", callback_data: `chat_reopen:${id}` }, { text: "Open in Admin", url: adminUrl }]];
  return [
    [...(c.assigned_name ? [] : [{ text: "🙋 Assign to me", callback_data: `chat_assign:${id}` }]), { text: "✍️ Reply", callback_data: `chat_reply:${id}` }],
    [{ text: c.status === "pending" ? "🟢 Open" : "🟡 Pending", callback_data: `${c.status === "pending" ? "chat_open" : "chat_pending"}:${id}` }, { text: "⚪ Close", callback_data: `chat_close:${id}` }, { text: "Open in Admin", url: adminUrl }],
  ];
}

/** Follow-up customer message, posted as a reply under the conversation card. */
export const customerMessage = (publicId: string, name: string | null, body: string) =>
  `💬 <b>${esc(publicId)}</b> · ${esc(name || "Website visitor")}\n<blockquote>${esc(clip(body, 3500))}</blockquote>`;

/** A reply sent from the admin dashboard, mirrored so Telegram shows the whole thread. */
export const staffEcho = (publicId: string, name: string, body: string) =>
  `↩️ <b>${esc(name)}</b> replied on the website · ${esc(publicId)}\n<blockquote>${esc(clip(body, 3500))}</blockquote>`;

export type CardBooking = { reference: string; customerName: string; pickup: string; dropoff: string; pickupDate: string; pickupTime: string; vehicle: string; passengers: number; luggage: number; total: number; payment: string; acknowledgedBy?: string | null };

export function bookingCard(b: CardBooking) {
  return [
    "🟠 <b>WAYDIDI</b>",
    "✅ <b>NEW BOOKING</b>",
    "",
    `👤 <b>${esc(b.customerName)}</b>`,
    `🚗 ${esc(b.pickup)} → ${esc(b.dropoff)}`,
    `📅 ${esc(b.pickupDate)}  🕒 ${esc(b.pickupTime)}`,
    `🚙 ${esc(b.vehicle)}`,
    `👥 ${b.passengers} passengers  🧳 ${b.luggage} luggage`,
    `💰 ฿${b.total.toLocaleString("en-US")} · ${esc(b.payment)}`,
    `🆔 ${esc(b.reference)}`,
    "",
    b.acknowledgedBy ? `🔵 Taken by <b>${esc(b.acknowledgedBy)}</b>` : "🟡 Awaiting assignment",
  ].join("\n");
}

export const bookingKeyboard = (b: CardBooking, adminUrl: string): InlineKeyboard => [
  [...(b.acknowledgedBy ? [] : [{ text: "🙋 Assign to me", callback_data: `booking_assign:${b.reference}` }]), { text: "Open booking", url: adminUrl }],
];

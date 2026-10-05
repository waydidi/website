import type { InlineKeyboard } from "./client";

// Rich-card presentation for Telegram (HTML parse mode). Business logic never builds Telegram text itself.

// Country flag + name ("DE" → "🇩🇪 Germany"); kept here so this file has no imports beyond types.
const countryLabel = (code: string | null | undefined) => {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  let name = code; try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { /* keep code */ }
  return `${code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))} ${name}`;
};

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

const RULE = "============================";

/**
 * Group card for a website chat:
 *   Website chat / Conversation id / Message (between rules) / Email / Origin country / Date-time,
 * with Assign / Let other assign buttons underneath.
 */
export function conversationCard(c: CardConversation, latest: { body: string; created_at: string; from: string } | null, fresh: boolean) {
  const lines = [
    `<b>Website chat</b>${fresh ? " 🆕" : ""}`,
    `Conversation <b>${esc(c.public_id)}</b>`,
    ...(c.customer_name ? [`👤 ${esc(c.customer_name)}`] : []),
    "",
    latest && latest.from !== "visitor" ? `Message (${esc(latest.from)}):` : "Message:",
    RULE,
    latest ? esc(clip(latest.body)) : "<i>No message yet</i>",
    RULE,
    "",
    `Email: ${c.customer_email ? esc(c.customer_email) : "Not given"}`,
    `Origin country: ${countryLabel(c.customer_country) ? esc(countryLabel(c.customer_country)) : "Unknown"}`,
    `Date/Time: ${esc(time(c.created_at))}`,
    ...(c.customer_phone ? [`Phone: ${esc(c.customer_phone)}`] : []),
    "",
    c.assigned_name ? `🔵 Assigned to <b>${esc(c.assigned_name)}</b> · ${STATUS_LABEL[c.status]}` : `👨‍💼 Not assigned yet · ${STATUS_LABEL[c.status]}`,
  ];
  return lines.join("\n");
}

export function conversationKeyboard(c: CardConversation, adminUrl: string): InlineKeyboard {
  const id = c.id;
  if (c.status === "closed") return [[{ text: "↩️ Reopen", callback_data: `chat_reopen:${id}` }, { text: "Open in Admin", url: adminUrl }]];
  if (!c.assigned_name) return [
    [{ text: "🙋 Assign", callback_data: `chat_assign:${id}` }],
    [{ text: "👥 Let other assign", callback_data: `chat_pick:${id}` }],
  ];
  return [
    [{ text: "✍️ Reply", callback_data: `chat_reply:${id}` }, { text: "⚪ Close", callback_data: `chat_close:${id}` }],
    [{ text: "👥 Reassign", callback_data: `chat_pick:${id}` }, { text: "Open in Admin", url: adminUrl }],
  ];
}

/** "Let other assign": one button per team member (callback data stays under Telegram's 64 bytes). */
export const pickKeyboard = (conversationId: string, team: { telegram_user_id: string; display_name: string }[]): InlineKeyboard => [
  ...team.map((t) => [{ text: `👤 ${t.display_name}`, callback_data: `ct:${conversationId}:${t.telegram_user_id}` }]),
  [{ text: "✖️ Cancel", callback_data: `chat_cancel:${conversationId}` }],
];

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

// Pure rules for AI quote drafts that the owner approves in Telegram (Sales Intelligence PR 2).
// The assistant never prices anything: prices come from the website's price tables or from the owner.

/** An approved quote stays valid for 3 hours from approval (owner decision D14). */
export const QUOTE_VALID_MS = 3 * 60 * 60 * 1000;
/** A draft can be approved for 12 hours; after that the buttons stop working. */
export const DRAFT_REVIEW_MS = 12 * 60 * 60 * 1000;
export const MIN_PRICE_THB = 100;
export const MAX_PRICE_THB = 1_000_000;

/** SALES_AI_QUOTE_APPROVAL="whatsapp,line": channels where every quote waits for the owner. Empty = off. */
export function approvalChannels(value: string | null | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => ["web", "whatsapp", "line"].includes(s)));
}

export type DraftOption = { vehicle: string; name: string; price: number | null };
export type DraftStatus = "pending" | "approving" | "sending" | "sent" | "undelivered" | "rejected" | "superseded" | "taken_over" | "expired";
export type Draft = {
  id: string; conversation_id: string; channel: string; status: DraftStatus; revision: number;
  pickup: string; dropoff: string; trip_date: string; trip_time: string; passengers: number; bags: number;
  summary: string; price_source: "price_table" | "manual"; options_json: string; selected: number;
  price_thb: number | null; table_price_thb: number | null; edited_by: string | null;
  visitor_seq: number; telegram_message_id: number | null; crm_quote_id: string | null; note: string | null;
  quote_expires_at: string | null; decided_by: string | null; decided_at: string | null; expires_at: string; created_at: string;
};

export const options = (d: Pick<Draft, "options_json">): DraftOption[] => {
  try { const v = JSON.parse(d.options_json); return Array.isArray(v) ? v : []; } catch { return []; }
};

/** "1800", "1,800", "฿1,800", "1800 THB", "1800 baht" -> 1800. Anything else (decimals, words, out of range) -> null. */
export function parsePriceReply(text: string | null | undefined): number | null {
  const m = /^\s*(?:฿|thb)?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(?:thb|baht|บาท|฿)?\s*$/i.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[1].replaceAll(",", ""));
  return Number.isSafeInteger(n) && n >= MIN_PRICE_THB && n <= MAX_PRICE_THB ? n : null;
}

/** The customer's language from their own writing: Thai script -> th, Chinese characters -> zh, otherwise en. */
export function customerLocale(text: string | null | undefined): "en" | "th" | "zh" {
  const t = text ?? "";
  if (/[฀-๿]/.test(t)) return "th";
  if (/[一-鿿]/.test(t)) return "zh";
  return "en";
}

export type QuoteAction = "ok" | "car" | "edit" | "no" | "take";
const ACTIONS: Record<string, QuoteAction> = { sq_ok: "ok", sq_car: "car", sq_edit: "edit", sq_no: "no", sq_take: "take" };
const ID = /^[a-f0-9]{16}$/;

/** Telegram callback data, at most 64 bytes: "sq_ok:<16 hex>:<revision>" or "sq_car:<id>:<revision>-<option>". */
export function quoteCallback(action: QuoteAction, id: string, revision: number, option?: number) {
  const name = Object.keys(ACTIONS).find((k) => ACTIONS[k] === action)!;
  return `${name}:${id}:${revision}${option === undefined ? "" : `-${option}`}`;
}
export function parseQuoteCallback(data: string | null | undefined): { action: QuoteAction; id: string; revision: number; option: number | null } | null {
  const [name, id, extra] = (data ?? "").split(":");
  const action = ACTIONS[name ?? ""];
  const m = /^(\d{1,4})(?:-(\d))?$/.exec(extra ?? "");
  if (!action || !ID.test(id ?? "") || !m) return null;
  return { action, id: id!, revision: Number(m[1]), option: m[2] === undefined ? null : Number(m[2]) };
}

export type ApprovalContext = {
  now: number;
  conversation: { status: string; assigned_staff_id: string | null; assigned_name: string | null; bot_thinking_at: string | null } | null;
  latestVisitorSeq: number;
  ownerStaffId: string;
};

/** Why a draft cannot be approved right now, or null when it can. Checked on the server at tap time. */
export function approvalBlocker(d: Draft, revision: number, ctx: ApprovalContext): string | null {
  if (d.status !== "pending") return d.status === "superseded" ? "A newer draft replaced this one." : `This draft is already ${d.status.replace("_", " ")}.`;
  if (revision !== d.revision) return "This card changed. Use the buttons on the updated card.";
  if (Date.parse(d.expires_at) <= ctx.now) return "This draft expired. Ask the customer to confirm the trip again.";
  if (d.price_thb === null) return "Set a price first (Edit price).";
  if (Date.parse(`${d.trip_date}T${d.trip_time}:00+07:00`) <= ctx.now + QUOTE_VALID_MS) return "The pickup is less than 3 hours away; reply to the customer yourself.";
  const c = ctx.conversation;
  if (!c || c.status === "closed") return "The chat is closed.";
  if (c.assigned_name && c.assigned_staff_id !== ctx.ownerStaffId) return `${c.assigned_name} has taken this chat.`;
  // The customer wrote again and the assistant is still reading it: a new draft may be on its way.
  if (ctx.latestVisitorSeq > d.visitor_seq && c.bot_thinking_at && ctx.now - Date.parse(c.bot_thinking_at) < 120_000) return "The customer just wrote again. Try again in a minute.";
  return null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;
const bangkok = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** The owner's Telegram card (English, owner decision D15). Customer contact details are not shown. */
export function draftCard(d: Draft, publicId: string | null, latestVisitorSeq: number) {
  const opts = options(d);
  const lines = [
    `<b>Quote draft${d.price_source === "manual" ? " · needs your price" : ""}</b> · ${esc(publicId ?? d.conversation_id.slice(0, 8))} · ${esc(d.channel)}`,
    esc(d.summary),
    `${d.passengers} passenger(s), ${d.bags} bag(s)`,
    "",
    d.price_source === "manual" ? "Price source: none (no published price for this route)" : "Price source: website price tables",
    ...opts.map((o, i) => `${i === d.selected ? "▶" : "•"} ${esc(o.name)}: ${o.price === null ? "no price" : baht(o.price)}`),
    ...(d.edited_by && d.price_thb !== null ? [`Edited price: <b>${baht(d.price_thb)}</b> (by ${esc(d.edited_by)}${d.table_price_thb !== null ? `, table ${baht(d.table_price_thb)}` : ""})`] : []),
    `Valid for 3 hours after you approve.`,
  ];
  if (latestVisitorSeq > d.visitor_seq && d.status === "pending") lines.push("⚠️ The customer wrote again after this draft. Check the chat first.");
  const status: Partial<Record<DraftStatus, string>> = {
    sent: `✅ Sent by ${esc(d.decided_by ?? "owner")}${d.price_thb !== null ? ` · ${baht(d.price_thb)}` : ""}${d.quote_expires_at ? ` · valid until ${bangkok(d.quote_expires_at)}` : ""}`,
    undelivered: `⚠️ Approved by ${esc(d.decided_by ?? "owner")}, but the message did not reach the customer. Reply in the chat.`,
    sending: "⚠️ Send result unknown. Check the chat before sending again.",
    approving: "Sending…",
    rejected: `❌ Rejected by ${esc(d.decided_by ?? "owner")}. Reply to the customer yourself.`,
    superseded: "Replaced by a newer draft.",
    taken_over: `🙋 ${esc(d.decided_by ?? "Owner")} took over the chat.`,
    expired: "Expired without a decision.",
  };
  if (status[d.status]) lines.push("", status[d.status]!);
  if (d.status === "undelivered" && d.note) lines.push(esc(d.note));
  return lines.join("\n");
}

export function draftKeyboard(d: Draft) {
  if (d.status !== "pending") return [];
  const opts = options(d), chosen = opts[d.selected];
  const rows: { text: string; callback_data: string }[][] = [];
  if (chosen && d.price_thb !== null) rows.push([{ text: `✅ Approve & send ${chosen.name} ${baht(d.price_thb)}`, callback_data: quoteCallback("ok", d.id, d.revision) }]);
  const others = opts.map((o, i) => ({ o, i })).filter(({ o, i }) => i !== d.selected && o.price !== null).slice(0, 3);
  if (others.length) rows.push(others.map(({ o, i }) => ({ text: `${o.name} ${baht(o.price!)}`, callback_data: quoteCallback("car", d.id, d.revision, i) })));
  rows.push([{ text: "✏️ Edit price", callback_data: quoteCallback("edit", d.id, d.revision) }, { text: "❌ Reject", callback_data: quoteCallback("no", d.id, d.revision) }, { text: "🙋 Take over", callback_data: quoteCallback("take", d.id, d.revision) }]);
  return rows;
}

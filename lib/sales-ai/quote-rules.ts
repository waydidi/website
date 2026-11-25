// Pure rules for AI quote drafts that the owner approves in Telegram (Sales Intelligence PR 2 and PR 4).
// The assistant never prices anything: prices come from the website's price tables or from the owner (decision D20).
// A draft is a bundle of one or more transfer legs from one assistant reply; the owner approves the bundle.

/** An approved quote stays valid for 3 hours from approval (owner decision D14). */
export const QUOTE_VALID_MS = 3 * 60 * 60 * 1000;
/** A draft can be approved for 12 hours; after that the buttons stop working. */
export const DRAFT_REVIEW_MS = 12 * 60 * 60 * 1000;
export const MIN_PRICE_THB = 100;
export const MAX_PRICE_THB = 1_000_000;
/** Legs in one bundle (Telegram buttons and message length stay manageable). */
export const MAX_LEGS = 6;

/** SALES_AI_QUOTE_APPROVAL="whatsapp,line": channels where every quote waits for the owner. Empty = off. */
export function approvalChannels(value: string | null | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => ["web", "whatsapp", "line"].includes(s)));
}

export type DraftOption = { vehicle: string; name: string; price: number | null };
export type DraftStatus = "pending" | "approving" | "sending" | "sent" | "undelivered" | "rejected" | "superseded" | "taken_over" | "expired";
/** One row per leg. Bundle-wide fields (status, revision, card, decision) are kept equal on every leg of a bundle. */
export type Draft = {
  id: string; bundle_id: string; leg_no: number; conversation_id: string; channel: string; status: DraftStatus; revision: number;
  pickup: string; dropoff: string; trip_date: string; trip_time: string; passengers: number; bags: number; needs: string | null;
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

// Needs that a price table cannot judge: the owner checks the car before approving (F04).
const CHECK_NEEDS = /wheel ?chair|mobility|รถเข็น|轮椅|golf|bike|bicycle|surf|ski|snowboard|oversize|over-size|large box|stroller|pram|dog|cat\b|pet\b|สัตว์|กอล์ฟ|จักรยาน/i;
const CHILD_SEAT = /child seat|baby seat|car seat|booster|infant|คาร์ซีท|ที่นั่งเด็ก|儿童座椅|安全座椅/i;
/** Special requests as the customer gave them, and whether the owner must check the car. */
export function specialNeeds(text: string | null | undefined): { note: string | null; check: boolean; childSeat: boolean } {
  const note = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  return { note, check: Boolean(note && CHECK_NEEDS.test(note)), childSeat: Boolean(note && CHILD_SEAT.test(note)) };
}

export type QuoteAction = "ok" | "car" | "edit" | "no" | "take";
const ACTIONS: Record<string, QuoteAction> = { sq_ok: "ok", sq_car: "car", sq_edit: "edit", sq_no: "no", sq_take: "take" };
const ID = /^[a-f0-9]{16}$/;

/** Telegram callback data, at most 64 bytes: "sq_ok:<bundle id>:<revision>" or "sq_car:<id>:<revision>-<option or leg>". */
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

/** Why a bundle cannot be approved right now, or null when it can. Checked on the server at tap time. */
export function approvalBlocker(legs: Draft[], revision: number, ctx: ApprovalContext): string | null {
  const d = legs[0];
  if (!d) return "This draft no longer exists.";
  if (d.status !== "pending") return d.status === "superseded" ? "A newer draft replaced this one." : `This draft is already ${d.status.replace("_", " ")}.`;
  if (revision !== d.revision) return "This card changed. Use the buttons on the updated card.";
  if (Date.parse(d.expires_at) <= ctx.now) return "This draft expired. Ask the customer to confirm the trip again.";
  const many = legs.length > 1;
  for (const l of legs) {
    if (l.price_thb === null) return many ? `Set a price for trip ${l.leg_no} first (Edit price).` : "Set a price first (Edit price).";
    if (Date.parse(`${l.trip_date}T${l.trip_time}:00+07:00`) <= ctx.now + QUOTE_VALID_MS) return `${many ? `Trip ${l.leg_no}: the` : "The"} pickup is less than 3 hours away; reply to the customer yourself.`;
  }
  const c = ctx.conversation;
  if (!c || c.status === "closed") return "The chat is closed.";
  if (c.assigned_name && c.assigned_staff_id !== ctx.ownerStaffId) return `${c.assigned_name} has taken this chat.`;
  // The customer wrote again and the assistant is still reading it: a new draft may be on its way.
  if (ctx.latestVisitorSeq > d.visitor_seq && c.bot_thinking_at && ctx.now - Date.parse(c.bot_thinking_at) < 120_000) return "The customer just wrote again. Try again in a minute.";
  return null;
}

/** Sum of leg prices, or null while any leg has no price. */
export const bundleTotal = (legs: Pick<Draft, "price_thb">[]) => legs.every((l) => l.price_thb !== null) ? legs.reduce((n, l) => n + l.price_thb!, 0) : null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;
const bangkok = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function legLines(l: Draft, many: boolean): string[] {
  const opts = options(l), needs = specialNeeds(l.needs);
  return [
    many ? `<b>Trip ${l.leg_no}</b> · ${esc(l.summary)}` : esc(l.summary),
    `${l.passengers} passenger(s), ${l.bags} bag(s)`,
    ...(needs.note ? [`${needs.check ? "⚠️ Check the car: " : "Requests: "}${esc(needs.note)}`] : []),
    l.price_source === "manual" ? "Price source: none (no published price for this route)" : "Price source: website price tables",
    ...(many
      ? [`${esc(opts[l.selected]?.name ?? "Car")}: ${l.price_thb === null ? "<b>needs your price</b>" : baht(l.price_thb)}${l.edited_by ? ` (edited by ${esc(l.edited_by)}${l.table_price_thb !== null ? `, table ${baht(l.table_price_thb)}` : ""})` : ""}`]
      : [...opts.map((o, i) => `${i === l.selected ? "▶" : "•"} ${esc(o.name)}: ${o.price === null ? "no price" : baht(o.price)}`),
        ...(l.edited_by && l.price_thb !== null ? [`Edited price: <b>${baht(l.price_thb)}</b> (by ${esc(l.edited_by)}${l.table_price_thb !== null ? `, table ${baht(l.table_price_thb)}` : ""})`] : [])]),
  ];
}

/** The owner's Telegram card (English, owner decision D15). Customer contact details are not shown. */
export function draftCard(legs: Draft[], publicId: string | null, latestVisitorSeq: number) {
  const d = legs[0], many = legs.length > 1, total = bundleTotal(legs);
  const manual = legs.some((l) => l.price_source === "manual");
  const lines = [
    `<b>Quote draft${many ? ` · ${legs.length} trips` : ""}${manual ? " · needs your price" : ""}</b> · ${esc(publicId ?? d.conversation_id.slice(0, 8))} · ${esc(d.channel)}`,
    ...legs.flatMap((l, i) => [...(i ? [""] : []), ...legLines(l, many)]),
    ...(many ? ["", total === null ? "Total: set every price first" : `Total: <b>${baht(total)}</b>`] : []),
    "", `Valid for 3 hours after you approve.${many ? " The customer can accept each trip separately." : ""}`,
  ];
  if (latestVisitorSeq > d.visitor_seq && d.status === "pending") lines.push("⚠️ The customer wrote again after this draft. Check the chat first.");
  const status: Partial<Record<DraftStatus, string>> = {
    sent: `✅ Sent by ${esc(d.decided_by ?? "owner")}${total !== null ? ` · ${baht(total)}` : ""}${d.quote_expires_at ? ` · valid until ${bangkok(d.quote_expires_at)}` : ""}`,
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

export function draftKeyboard(legs: Draft[]) {
  const d = legs[0];
  if (!d || d.status !== "pending") return [];
  const many = legs.length > 1, total = bundleTotal(legs);
  const rows: { text: string; callback_data: string }[][] = [];
  if (many) {
    if (total !== null) rows.push([{ text: `✅ Approve & send ${legs.length} trips ${baht(total)}`, callback_data: quoteCallback("ok", d.bundle_id, d.revision) }]);
    for (let i = 0; i < legs.length; i += 3) rows.push(legs.slice(i, i + 3).map((l, j) => ({ text: `✏️ Trip ${l.leg_no} price`, callback_data: quoteCallback("edit", d.bundle_id, d.revision, i + j) })));
  } else {
    const opts = options(d), chosen = opts[d.selected];
    if (chosen && d.price_thb !== null) rows.push([{ text: `✅ Approve & send ${chosen.name} ${baht(d.price_thb)}`, callback_data: quoteCallback("ok", d.bundle_id, d.revision) }]);
    const others = opts.map((o, i) => ({ o, i })).filter(({ o, i }) => i !== d.selected && o.price !== null).slice(0, 3);
    if (others.length) rows.push(others.map(({ o, i }) => ({ text: `${o.name} ${baht(o.price!)}`, callback_data: quoteCallback("car", d.bundle_id, d.revision, i) })));
    rows.push([{ text: "✏️ Edit price", callback_data: quoteCallback("edit", d.bundle_id, d.revision) }]);
  }
  rows.push([{ text: "❌ Reject", callback_data: quoteCallback("no", d.bundle_id, d.revision) }, { text: "🙋 Take over", callback_data: quoteCallback("take", d.bundle_id, d.revision) }]);
  return rows;
}

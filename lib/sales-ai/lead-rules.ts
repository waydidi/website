// Pure rules for Sales Intelligence PR 5: lead scoring (F07), follow-up decisions (F10) and lost-quote
// analysis (F12). Scores are heuristics to order the owner's attention, never conversion probabilities, and
// they never change a price or refuse service. Nothing here uses nationality or any protected trait.

// ---------- F07 lead scoring ----------

export const SIGNALS = {
  specific_date: 15, route: 10, group_details: 10, quote_request: 10, payment_question: 15,
  booking_link_request: 20, returning_customer: 10, intent: 10, postponed: -15, declined: -30,
} as const;
export type Signal = keyof typeof SIGNALS;
export const SIGNAL_LABEL: Record<Signal, string> = {
  specific_date: "Specific travel date", route: "Pickup and drop-off given", group_details: "Passengers and bags given", quote_request: "Asked for a price",
  payment_question: "Asked about payment", booking_link_request: "Asked to book / accepted a quote", returning_customer: "Returning customer",
  intent: "Said they want to book", postponed: "Postponed", declined: "Declined",
};

// Message patterns (English, Thai, Chinese). Each signal counts once per chat, however often it repeats.
const PATTERNS: Partial<Record<Signal, RegExp>> = {
  payment_question: /\b(pay|payment|paying|card|credit card|bank transfer|promptpay|deposit|cash)\b|จ่าย|โอน|ชำระ|มัดจำ|付款|支付|转账|定金/i,
  booking_link_request: /\b(booking link|send (me )?the link|book now|how (do|can) i book)\b|ส่งลิงก์|จองเลย|预订链接|怎么预订/i,
  intent: /\b(i('| a)?m? ?(want|would like|'d like) to book|let'?s book|i'?ll take it|go ahead|confirm(ed)?|book it|reserve)\b|จอง|ยืนยัน|预订|确认/i,
  postponed: /\b(later|next time|not sure yet|maybe|think about it|let me think|not now|another time)\b|ไว้ก่อน|ทีหลัง|ขอคิดดูก่อน|再说|考虑一下|以后/i,
  declined: /\b(no thanks|not interested|too expensive|found another|booked (with )?another|cancel(led)?|don'?t need)\b|ไม่เอา|ไม่สนใจ|แพงไป|ยกเลิก|不用了|太贵|不需要|取消/i,
};
export const OPT_OUT = /^\s*(stop|unsubscribe|don'?t (message|contact) me|no more messages|หยุด|ไม่ต้องส่ง|退订|别再发)\b/i;

/** Signals found in one customer message (deterministic; the message id is kept as evidence). */
export function messageSignals(body: string): Signal[] {
  return (Object.keys(PATTERNS) as Signal[]).filter((s) => PATTERNS[s]!.test(body));
}

export type Band = "hot" | "warm" | "interested" | "cold";
export const band = (score: number): Band => (score >= 80 ? "hot" : score >= 60 ? "warm" : score >= 40 ? "interested" : "cold");

/** Points lost per day without a customer message, after a grace period. */
export const DECAY_GRACE_DAYS = 3, DECAY_PER_DAY = 3;

/** Reproducible score from the recorded signals: each counts once, capped 0–100, minus decay for silence. */
export function leadScore(signals: Iterable<Signal>, lastCustomerAt: string | null, now = Date.now()) {
  const set = [...new Set(signals)];
  const raw = set.reduce((n, s) => n + SIGNALS[s], 0);
  const idleDays = lastCustomerAt ? Math.max(0, Math.floor((now - Date.parse(lastCustomerAt)) / 86400000) - DECAY_GRACE_DAYS) : 0;
  const decay = idleDays * DECAY_PER_DAY;
  const score = Math.max(0, Math.min(100, raw - decay));
  return { score, band: band(score), reasons: [...set.sort((a, b) => SIGNALS[b] - SIGNALS[a]), ...(decay ? [`decay_${decay}` as const] : [])], decay };
}

// ---------- F10 follow-ups ----------

/** SALES_AI_FOLLOWUP_HOURS="2,22": customer follow-ups after a quote is sent. Each must stay within WhatsApp's 24 hours. */
export function followupHours(value: string | null | undefined): number[] {
  const hours = (value ?? "2,22").split(",").map((s) => Number(s.trim())).filter((h) => Number.isFinite(h) && h >= 1 && h <= 23);
  return [...new Set(hours)].sort((a, b) => a - b).slice(0, 3);
}
export const REVIEW_AFTER_DAYS = 7;
export const MAX_FOLLOWUPS_PER_WEEK = 2;
/** Never two follow-ups close together (e.g. both due after quiet hours or an outage). */
export const MIN_GAP_HOURS = 6;

/** Bangkok quiet hours 21:00–08:00: the due time moves to 08:30 Bangkok. */
export function outsideQuietHours(at: number): number {
  const local = new Date(at + 7 * 3600_000), h = local.getUTCHours();
  if (h >= 8 && h < 21) return at;
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (h >= 21 ? 1 : 0), 8, 30) - 7 * 3600_000);
  return day.getTime();
}

export type FollowupState = {
  now: number; flagOn: boolean; channelOff: boolean; conversationStatus: string | null; assignedName: string | null; botPaused: boolean;
  repliedSinceQuote: boolean; accepted: boolean; optedOut: boolean; declined: boolean; firstPickupAt: number; sentThisWeek: number; lastSentAt: number | null; windowOpen: boolean;
};
export type FollowupDecision = { send: true } | { send: false; outcome: "cancelled" | "suppressed" | "later"; reason: string };

/** Decided at send time, never at scheduling time: anything that changed since then is respected. */
export function followupDecision(s: FollowupState): FollowupDecision {
  if (!s.flagOn) return { send: false, outcome: "suppressed", reason: "follow-ups switched off" };
  if (s.accepted) return { send: false, outcome: "cancelled", reason: "quote accepted" };
  if (s.declined) return { send: false, outcome: "cancelled", reason: "customer declined" };
  if (s.optedOut) return { send: false, outcome: "cancelled", reason: "customer asked not to be contacted" };
  if (s.repliedSinceQuote) return { send: false, outcome: "cancelled", reason: "customer replied" };
  if (s.firstPickupAt <= s.now) return { send: false, outcome: "cancelled", reason: "trip date passed" };
  if (!s.conversationStatus || s.conversationStatus === "closed") return { send: false, outcome: "cancelled", reason: "chat closed" };
  if (s.assignedName) return { send: false, outcome: "suppressed", reason: `${s.assignedName} has the chat` };
  if (s.botPaused) return { send: false, outcome: "suppressed", reason: "assistant paused in this chat" };
  if (s.channelOff) return { send: false, outcome: "suppressed", reason: "assistant switched off on this channel" };
  if (s.sentThisWeek >= MAX_FOLLOWUPS_PER_WEEK) return { send: false, outcome: "suppressed", reason: "weekly follow-up limit reached" };
  if (s.lastSentAt !== null && s.now - s.lastSentAt < MIN_GAP_HOURS * 3600_000) return { send: false, outcome: "suppressed", reason: `another follow-up was sent less than ${MIN_GAP_HOURS} hours ago` };
  if (outsideQuietHours(s.now) !== s.now) return { send: false, outcome: "later", reason: "quiet hours" };
  if (!s.windowOpen) return { send: false, outcome: "suppressed", reason: "more than 24 hours since the customer's last message and no approved template" };
  return { send: true };
}

// ---------- F12 lost-quote analysis ----------

export const LOSS_REASONS = ["pricing", "plans_changed", "competitor", "unavailable", "response_delay", "payment_friction", "other", "unknown"] as const;
export type LossReason = (typeof LOSS_REASONS)[number];
export const LOSS_LABEL: Record<LossReason, string> = { pricing: "Price", plans_changed: "Plans changed", competitor: "Competitor", unavailable: "No car / supplier",
  response_delay: "Slow reply", payment_friction: "Payment problem", other: "Other", unknown: "Unknown" };

const INFER: [LossReason, RegExp][] = [
  ["pricing", /too expensive|price is high|cheaper|expensive|แพง|太贵|便宜/i],
  ["competitor", /found another|another company|booked (with )?another|grab|bolt|other driver|เจ้าอื่น|别家|其他公司/i],
  ["plans_changed", /plans? changed|not going|trip cancel|change of plan|เปลี่ยนแผน|ไม่ไปแล้ว|计划有变|不去了/i],
  ["payment_friction", /can'?t pay|payment (failed|problem)|no card|จ่ายไม่ได้|付不了/i],
];
/** A reason suggested by the customer's own words, with the message as evidence; never a guess from silence. */
export function inferLossReason(messages: { id: string; body: string }[]): { reason: LossReason; evidence: string } | null {
  for (const m of [...messages].reverse()) for (const [reason, re] of INFER) if (re.test(m.body)) return { reason, evidence: m.id };
  return null;
}

export type QuoteOutcome = "converted" | "accepted" | "open" | "declined" | "no_decision";
export const OBSERVATION_DAYS = 7;
/** A sent quote's outcome. Silence is "open" during the observation period, then "no decision", never "lost" by itself. */
export function quoteOutcome(q: { anyConverted: boolean; anyAccepted: boolean; declined: boolean; staffLabel: LossReason | null; sentAt: string; validUntil: string | null }, now = Date.now()): QuoteOutcome {
  if (q.anyConverted) return "converted";
  if (q.anyAccepted) return "accepted";
  if (q.declined || (q.staffLabel && q.staffLabel !== "unknown")) return "declined";
  const end = Math.max(Date.parse(q.sentAt) + OBSERVATION_DAYS * 86400000, q.validUntil ? Date.parse(q.validUntil) : 0);
  return now < end ? "open" : "no_decision";
}

export const MIN_SAMPLE = 20;
export const sizeBucket = (thb: number) => (thb < 1500 ? "under ฿1,500" : thb < 3000 ? "฿1,500–2,999" : thb < 6000 ? "฿3,000–5,999" : "฿6,000 and over");
export const latencyBucket = (minutes: number | null) => (minutes === null ? "unknown" : minutes <= 15 ? "within 15 min" : minutes <= 60 ? "15–60 min" : minutes <= 240 ? "1–4 hours" : "over 4 hours");

export type Row = { group: string; quotes: number; converted: number; accepted: number; open: number; declined: number; noDecision: number; quotedThb: number; wonThb: number };
/** Groups closed quotes for conversion: open quotes are counted but left out of the rate. */
export function summarize(items: { group: string; outcome: QuoteOutcome; totalThb: number }[]) {
  const rows = new Map<string, Row>();
  for (const i of items) {
    const r = rows.get(i.group) ?? { group: i.group, quotes: 0, converted: 0, accepted: 0, open: 0, declined: 0, noDecision: 0, quotedThb: 0, wonThb: 0 };
    r.quotes++; r.quotedThb += i.totalThb;
    if (i.outcome === "converted") { r.converted++; r.wonThb += i.totalThb; }
    else if (i.outcome === "accepted") r.accepted++;
    else if (i.outcome === "open") r.open++;
    else if (i.outcome === "declined") r.declined++;
    else r.noDecision++;
    rows.set(i.group, r);
  }
  return [...rows.values()].sort((a, b) => b.quotes - a.quotes).map((r) => {
    const closed = r.quotes - r.open;
    return { ...r, closed, conversionRate: closed ? r.converted / closed : null, enoughData: closed >= MIN_SAMPLE };
  });
}

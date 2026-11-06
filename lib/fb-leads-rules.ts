// Rules for Facebook group leads: posts a collector sends in (email forward or browser extension) become drafted
// comments in the Telegram Comment group, with Posted / Skip buttons. Pure (no database, network or runtime imports),
// so every rule is unit tested (tests/fb-leads-rules.test.mjs). Collector input is untrusted and read here, once.

export const MAX_POSTS_PER_REQUEST = 25;
export const MAX_TEXT = 4000;
export const MAX_GROUP_NAME = 120;
/** Post text and comments are kept this long (PDPA: only what is needed); the link and status stay for the counts. */
export const LEAD_KEEP_DAYS = 90;
export const DEFAULT_DAILY_LIMIT = 50;
export const MAX_DAILY_LIMIT = 1000;
export const MAX_ATTEMPTS = 3;
/** A draft that has not finished in this time is treated as failed and tried again. */
export const DRAFTING_TIMEOUT_MIN = 10;

/** On only when the owner sets FB_LEADS_ENABLED=true, the ingest token is long enough and a Comment group is set up. */
export function leadsEnabled(vars: { FB_LEADS_ENABLED?: string; FB_LEADS_INGEST_TOKEN?: string; TELEGRAM_COMMENT_CHAT_ID?: string }) {
  return String(vars.FB_LEADS_ENABLED ?? "").trim().toLowerCase() === "true"
    && String(vars.FB_LEADS_INGEST_TOKEN ?? "").length >= 32
    && Boolean(String(vars.TELEGRAM_COMMENT_CHAT_ID ?? "").trim());
}

export function dailyLimit(raw: string | undefined) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DAILY_LIMIT ? n : DEFAULT_DAILY_LIMIT;
}

/** The start of the Thailand day that `now` falls in, as an ISO time (the daily limit counts from here). */
export function thaiDayStart(now: Date) {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 7 * 3_600_000).toISOString();
}

const FB_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com"]);
const GROUP = /^[A-Za-z0-9._-]{1,100}$/;
const POST = /^(?:\d{5,25}|pfbid[A-Za-z0-9]{10,100})$/;

export type PostRef = { groupKey: string; postKey: string; url: string };

/**
 * A Facebook group post link → its group and post, and one clean link (tracking parameters such as __cft__ dropped).
 * Accepts /groups/<g>/posts/<p>, /groups/<g>/permalink/<p> and /groups/<g>/?multi_permalinks=<p>.
 */
export function parsePostUrl(raw: unknown): PostRef | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !FB_HOSTS.has(u.hostname.toLowerCase()) || u.username || u.password) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "groups" || !parts[1] || !GROUP.test(parts[1])) return null;
  const groupKey = parts[1];
  let postKey = "";
  if ((parts[2] === "posts" || parts[2] === "permalink") && parts[3]) postKey = parts[3];
  else if (parts.length === 2) postKey = (u.searchParams.get("multi_permalinks") ?? "").split(",")[0];
  if (!POST.test(postKey)) return null;
  return { groupKey, postKey, url: `https://www.facebook.com/groups/${groupKey}/posts/${postKey}/` };
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

export type IncomingPost = PostRef & { groupName: string; text: string };
export type Rejected = { index: number; reason: string };

/** The collector's body → posts to queue, and the ones refused with a reason (never the post text). */
export function readIngest(body: unknown): { posts: IncomingPost[]; rejected: Rejected[] } | { error: string } {
  if (!body || typeof body !== "object" || !Array.isArray((body as { posts?: unknown }).posts)) return { error: "Send {\"posts\":[{\"url\",\"text\",\"groupName\"}]}." };
  const list = (body as { posts: unknown[] }).posts;
  if (list.length === 0) return { error: "No posts." };
  if (list.length > MAX_POSTS_PER_REQUEST) return { error: `At most ${MAX_POSTS_PER_REQUEST} posts per request.` };
  const posts: IncomingPost[] = [], rejected: Rejected[] = [], seen = new Set<string>();
  list.forEach((item, index) => {
    const p = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const ref = parsePostUrl(p.url);
    if (!ref) return rejected.push({ index, reason: "Not a Facebook group post link." });
    const text = typeof p.text === "string" ? clean(p.text).slice(0, MAX_TEXT) : "";
    if (text.length < 3) return rejected.push({ index, reason: "The post text is empty." });
    const name = typeof p.groupName === "string" ? clean(p.groupName).replace(/\s+/g, " ").slice(0, MAX_GROUP_NAME) : "";
    const key = `${ref.groupKey}/${ref.postKey}`;
    if (seen.has(key)) return rejected.push({ index, reason: "The same post twice in one request." });
    seen.add(key);
    posts.push({ ...ref, groupName: name || ref.groupKey, text });
  });
  return { posts, rejected };
}

// A browser extension sees every post in a busy group (photos, chat, adverts). This cheap check keeps those out of the
// AI queue, so the daily limit goes to posts where someone asks or needs something. It is deliberately broad: a question
// mark, or a word about asking, transport or tours in English, Thai or Chinese. The AI still decides what a lead is.
const REQUEST_WORDS = /recommend|looking for|look for|anyone|anybody|any ideas|suggest|how to|how do|how much|how can|how far|where|which|what is|what's|best way|best time|can i|can we|should i|need|advice|tips|help|driver|transfer|taxi|grab|bolt|\btour|\bvan\b|rent|ferry|airport|visa|แนะนำ|ช่วย|รบกวน|ใครรู้|ไหม|มั้ย|หรือไม่|ที่ไหน|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|อะไร|หา|ต้องการ|รถ|คนขับ|เหมา|ทัวร์|เที่ยว|推荐|请问|求|有没有|怎么|多少钱|包车|接机|送机|司机|哪里|哪个|攻略|需要/i;
export const looksLikeRequest = (text: string) => /[?？]/.test(text) || REQUEST_WORDS.test(text);

/** Posts a comment can help with. Social chat (introductions, "anyone here this week") is not a lead. */
export const isLead = (replyType: string) => replyType === "sales" || replyType === "adjacent" || replyType === "info";

/**
 * Ready to post only when at least one fact passed the source checks and saved knowledge is not out of date.
 * Otherwise the draft is still sent, marked "Needs your check" with the reason.
 */
export function reliability(d: { factCount: number; stale: boolean }): { reliable: true } | { reliable: false; reason: string } {
  if (d.stale) return { reliable: false, reason: "the saved facts are time-sensitive and over 3 months old" };
  if (d.factCount < 1) return { reliable: false, reason: "no fact passed the source checks" };
  return { reliable: true };
}

export type LeadAction = "posted" | "skipped";
/** A Posted / Skip button: `fl_posted:<id>` or `fl_skip:<id>`. */
export function parseLeadCallback(data: string): { action: LeadAction; id: string } | null {
  const m = /^fl_(posted|skip):([a-f0-9]{16})$/.exec(data);
  return m ? { action: m[1] === "posted" ? "posted" : "skipped", id: m[2] } : null;
}

/** "06/11/2026 14:05" in Thailand time. */
export function thaiStamp(d: Date) {
  const b = new Date(d.getTime() + 7 * 3_600_000), two = (n: number) => String(n).padStart(2, "0");
  return `${two(b.getUTCDate())}/${two(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${two(b.getUTCHours())}:${two(b.getUTCMinutes())}`;
}

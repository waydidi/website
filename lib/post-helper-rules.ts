// Rules for the Telegram post helper (/post): which web sources may support which kind of fact, how old they may be,
// when saved knowledge needs refreshing, and how a draft is shown. Pure (no database, network or runtime imports),
// so every rule is unit tested (tests/post-helper-rules.test.mjs). The web is untrusted: the model proposes facts
// with sources, and only the checks here decide what reaches the team.

export type Tier = 1 | 2 | 3;
export type Category = "visa" | "fees" | "safety" | "health" | "money" | "hours" | "schedule" | "tip" | "general";
const CATEGORIES: Category[] = ["visa", "fees", "safety", "health", "money", "hours", "schedule", "tip", "general"];
const RISKY = new Set<Category>(["visa", "fees", "safety", "health", "money", "hours", "schedule"]);
export const isRisky = (c: Category) => RISKY.has(c);

/** Official: government, airports, tourism authority, railway. Trusted for rules and facts. */
export const TIER1_DOMAINS = ["go.th", "tourismthailand.org", "tat.or.th", "airportthai.co.th", "railway.co.th", "thaievisa.go.th", "caat.or.th"];
/** Established news. Trusted for facts when recent. */
export const TIER2_DOMAINS = ["bangkokpost.com", "nationthailand.com", "thaipbsworld.com", "khaosodenglish.com", "thethaiger.com", "reuters.com", "apnews.com", "bbc.com", "channelnewsasia.com"];
/** Never used: social posts, forums and Q&A sites (anyone can write anything). */
export const BLOCKED_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "tiktok.com", "reddit.com", "quora.com", "pinterest.com", "pantip.com", "x.com", "twitter.com", "youtube.com", "tripadvisor.com", "wikitravel.org"];

const BLOG_MAX_DAYS = 365, NEWS_RISKY_MAX_DAYS = 180, NEWS_MAX_DAYS = 365;
export const REPEATS_TO_SAVE = 3, REPEAT_WINDOW_DAYS = 30, STALE_WARNING_DAYS = 90, DRAFT_KEEP_DAYS = 7;

/** Each person may draft this many comments a month (Thailand calendar month); the owner can change it in Admin. */
export const DEFAULT_USER_LIMIT = 500;
export const MAX_USER_LIMIT = 100_000;
export const monthKey = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
/** "1 November" for the month after `d` (when a person's count starts again). */
export const nextMonthStart = (d: Date) => { const b = new Date(d.getTime() + 7 * 3_600_000); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }); };

export const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const inList = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

/** 0 = blocked, 1 = official, 2 = news, 3 = blog / other recent site. */
export function classifySource(url: string, blocked: string[] = BLOCKED_DOMAINS): { host: string; tier: 0 | Tier } {
  const host = hostOf(url);
  if (!host || !/^https?:\/\//i.test(url)) return { host, tier: 0 };
  if (inList(host, blocked)) return { host, tier: 0 };
  if (inList(host, TIER1_DOMAINS)) return { host, tier: 1 };
  if (inList(host, TIER2_DOMAINS)) return { host, tier: 2 };
  return { host, tier: 3 };
}

/** Days old from a search result's page_age ("March 3, 2026", "2026-03-03", "2 months ago"); null when unknown. */
export function pageAgeDays(pageAge: string | null | undefined, now: Date): number | null {
  const s = (pageAge ?? "").trim();
  if (!s) return null;
  const rel = /^(\d+)\s*(day|week|month|year)s?\s+ago$/i.exec(s);
  if (rel) return Math.round(Number(rel[1]) * { day: 1, week: 7, month: 30, year: 365 }[rel[2].toLowerCase() as "day"]);
  if (/^(today|just now)$/i.test(s)) return 0;
  if (/^yesterday$/i.test(s)) return 1;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 86_400_000)) : null;
}

/** May this source support a fact of this kind? Blogs only support tips; risky facts need official or recent news. */
export function sourceUsable(tier: 0 | Tier, ageDays: number | null, risky: boolean): boolean {
  if (tier === 0) return false;
  if (tier === 1) return true;
  if (tier === 2) return risky ? ageDays !== null && ageDays <= NEWS_RISKY_MAX_DAYS : ageDays === null || ageDays <= NEWS_MAX_DAYS;
  return !risky && ageDays !== null && ageDays <= BLOG_MAX_DAYS;
}

export type FoundSource = { url: string; title?: string; pageAge?: string | null };
export type ProposedFact = { claim: string; category: Category; sources: string[] };
export type CheckedSource = { url: string; host: string; tier: Tier; dateLabel: string };
export type KeptFact = { claim: string; category: Category; sources: CheckedSource[]; label: "official" | "news" | "blog"; risky: boolean };
export type DroppedFact = { claim: string; reason: string };

export const formatDate = (d: Date | string) => { const t = typeof d === "string" ? new Date(d) : d; const b = new Date(t.getTime() + 7 * 3_600_000); return `${String(b.getUTCDate()).padStart(2, "0")}/${String(b.getUTCMonth() + 1).padStart(2, "0")}/${b.getUTCFullYear()}`; };

/**
 * Keeps the facts the sources really support. A fact must cite pages the search actually returned; risky facts
 * (visa, fees, safety, health, money, opening hours, schedules) need an official page, or two different recent news sites.
 */
export function verifyFacts(facts: ProposedFact[], found: FoundSource[], now: Date, blocked: string[] = BLOCKED_DOMAINS): { kept: KeptFact[]; dropped: DroppedFact[] } {
  const byUrl = new Map(found.map((s) => [s.url, s]));
  const kept: KeptFact[] = [], dropped: DroppedFact[] = [];
  for (const fact of facts) {
    const risky = isRisky(fact.category);
    const used: CheckedSource[] = [];
    for (const url of fact.sources) {
      const hit = byUrl.get(url);
      if (!hit) continue;
      const { host, tier } = classifySource(url, blocked);
      const age = pageAgeDays(hit.pageAge, now);
      if (tier === 0 || !sourceUsable(tier, age, risky)) continue;
      used.push({ url, host, tier, dateLabel: hit.pageAge ? (age !== null ? formatDate(new Date(now.getTime() - age * 86_400_000)) : hit.pageAge) : "date not shown" });
    }
    const official = used.some((s) => s.tier === 1), newsHosts = new Set(used.filter((s) => s.tier === 2).map((s) => s.host));
    const enough = risky ? official || newsHosts.size >= 2 : used.length > 0;
    if (!fact.claim.trim()) continue;
    if (!enough) { dropped.push({ claim: fact.claim, reason: !fact.sources.some((u) => byUrl.has(u)) ? "no source found for it" : risky ? "needs an official source or two recent news sources" : "sources too old or not allowed" }); continue; }
    const best = Math.min(...used.map((s) => s.tier));
    kept.push({ claim: fact.claim.trim(), category: fact.category, sources: used, label: best === 1 ? "official" : best === 2 ? "news" : "blog", risky });
  }
  return { kept, dropped };
}

/** `/c <post>` (also `/c@BotName`). Only this command: `/comment`, `/p` and `/post` are not accepted: the pasted text, "" when only the command was sent, null when it is not this command. */
export function parsePostCommand(message: string): string | null {
  const m = /^\/c(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.trim());
  return m ? (m[1] ?? "").trim() : null;
}

/**
 * Where /c runs. With a separate Comment group (TELEGRAM_COMMENT_CHAT_ID) it runs only there and the Admin
 * group is pointed to it; without one it runs in the Admin group, so the feature works before the group is set up.
 */
export function postCommandRoute(chatId: string, adminChatId: string, commentChatId: string, message: string): "run" | "redirect" | "ignore" {
  if (parsePostCommand(message) === null) return "ignore";
  if (commentChatId) return chatId === commentChatId ? "run" : chatId === adminChatId ? "redirect" : "ignore";
  return chatId === adminChatId ? "run" : "ignore";
}
/** May the draft's buttons be used from this chat? */
export const postCallbackAllowed = (chatId: string, adminChatId: string, commentChatId: string) => Boolean(chatId) && (commentChatId ? chatId === commentChatId : chatId === adminChatId);

export const topicKey = (raw: string) => String(raw ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** The latest 10 January / 10 July (Thailand date) on or before now: saved knowledge older than this is due a refresh. */
export function lastRefreshDate(now: Date): string {
  const b = new Date(now.getTime() + 7 * 3_600_000), y = b.getUTCFullYear(), md = (b.getUTCMonth() + 1) * 100 + b.getUTCDate();
  return md >= 710 ? `${y}-07-10` : md >= 110 ? `${y}-01-10` : `${y - 1}-07-10`;
}
export const refreshDue = (refreshedAt: string, now: Date) => new Date(refreshedAt).getTime() < Date.parse(`${lastRefreshDate(now)}T00:00:00+07:00`);
export const ageDays = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
export const staleWarning = (e: { timeSensitive: boolean; collectedAt: string }, now: Date) => e.timeSensitive && ageDays(e.collectedAt, now) > STALE_WARNING_DAYS;

/** Reads a JSON object out of the model's reply (it may wrap it in text). */
export function jsonObject(raw: string): Record<string, unknown> | null {
  try { const v = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; }
}
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Keeps line breaks (a post template has lines), trims each line and collapses blank runs. */
const multiline = (v: unknown, max: number) => (typeof v === "string" ? v.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");

export type Route = { pickup: string; dropoff: string; passengers: number; bags: number };
/** The playbook's reply types: sales (asks to hire), adjacent (a transport problem Waydidi could solve), info, social. */
export type ReplyType = "sales" | "adjacent" | "info" | "social";
/**
 * What kind of post it is, for the Facebook leads flow (only "request" becomes a lead; /c ignores it): a real request,
 * an advert or self-promotion, a news repost, a giveaway, engagement bait, a meme, spam, or chat.
 */
export const POST_TYPES = ["request", "advert", "news", "giveaway", "bait", "meme", "spam", "chat"] as const;
export type PostType = typeof POST_TYPES[number];
/** The poster's mood, read by the AI sorter, so a booking enquiry's closing line fits it. "none" when not clear. */
export const MOODS = ["excited", "stressed", "family", "price", "unsure"] as const;
export type Mood = typeof MOODS[number];
export const MOOD_LABEL: Record<Mood | "none", string> = { excited: "Excited", stressed: "Stressed", family: "Family", price: "Price-minded", unsure: "Unsure", none: "No clear mood" };
/**
 * `advert` = postType "advert" (kept for older code); `inThailand`: whether the question is about Thailand. `mood` is
 * missing on posts sorted before moods existed: read it as "none".
 */
export type Routed = { language: "en" | "th" | "zh" | "other"; kind: "transport" | "travel" | "other"; replyType: ReplyType; topic: string; question: string; timeSensitive: boolean; route: Route | null; advert: boolean; postType: PostType; inThailand: "yes" | "no" | "unclear"; area: string | null; mood?: Mood | "none" };
/** The sorter's post type and place. A missing or unknown answer keeps the post (request, place unclear). */
/**
 * The place the post is about (the place it names, or the place in the Facebook group's name). A place-dependent
 * answer must never be reused for another place, so the area is put at the front of the saved-knowledge key.
 */
export function withAreaTopic(routed: Routed): Routed {
  if (!routed.area) return routed;
  const slug = topicKey(routed.area);
  return slug && !routed.topic.includes(slug) ? { ...routed, topic: topicKey(`${slug}-${routed.topic}`) } : routed;
}
/**
 * Why the AI sorter says a post is not a Facebook lead ("" = it is one): its post type when not a real request, a
 * question clearly about another country, or chat. Used when a post arrives and again before drafting.
 */
export function leadSkipReason(routed: Pick<Routed, "postType" | "inThailand" | "replyType">): string {
  if (routed.postType !== "request") return routed.postType;
  if (routed.inThailand === "no") return "not_thailand";
  if (routed.replyType === "social") return "chat";
  return "";
}
function sortPost(o: Record<string, unknown>): Pick<Routed, "advert" | "postType" | "inThailand" | "area"> {
  const postType: PostType = POST_TYPES.includes(o.postType as PostType) ? o.postType as PostType : o.advert === true ? "advert" : "request";
  const inThailand = o.inThailand === "yes" || o.inThailand === "no" ? o.inThailand : "unclear";
  const area = text(o.area, 80);
  return { advert: postType === "advert", postType, inThailand, area: area && !/^(?:null|none|thailand|unknown)$/i.test(area) ? area : null };
}
export function parseRouted(raw: string): Routed | null {
  const o = jsonObject(raw);
  if (!o) return null;
  const topic = topicKey(text(o.topic, 80)), question = text(o.question, 200);
  if (!topic || !question) return null;
  const r = o.route && typeof o.route === "object" ? o.route as Record<string, unknown> : null;
  const n = (v: unknown, d: number, max: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : d; };
  const route = r && text(r.pickup, 120) && text(r.dropoff, 120) ? { pickup: text(r.pickup, 120), dropoff: text(r.dropoff, 120), passengers: Math.max(1, n(r.passengers, 2, 30)), bags: n(r.bags, 2, 40) } : null;
  const replyType: ReplyType = o.replyType === "sales" || o.replyType === "adjacent" || o.replyType === "social" ? o.replyType : "info";
  return { language: o.language === "th" || o.language === "zh" || o.language === "en" ? o.language : "other", kind: o.kind === "transport" ? "transport" : o.kind === "travel" ? "travel" : "other", replyType, topic, question, timeSensitive: o.timeSensitive === true, route, ...sortPost(o), mood: MOODS.includes(o.mood as Mood) ? o.mood as Mood : "none" };
}
export function parseFacts(raw: string): ProposedFact[] {
  const o = jsonObject(raw);
  const list = Array.isArray(o?.facts) ? o!.facts as unknown[] : [];
  const out: ProposedFact[] = [];
  for (const item of list.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const claim = text(f.claim, 400), category = CATEGORIES.includes(f.category as Category) ? f.category as Category : "general";
    const sources = (Array.isArray(f.sources) ? f.sources : []).filter((u): u is string => typeof u === "string").slice(0, 4);
    if (claim) out.push({ claim, category: isRisky(category) || category === "tip" ? category : "general", sources });
  }
  return out;
}
export function parseComposed(raw: string): { comment: string } | null {
  const o = jsonObject(raw);
  const comment = multiline(o?.comment, 1500);
  return comment ? { comment } : null;
}

// Closings follow the owner's playbook: a booking enquiry gets one WhatsApp line, an information reply gets a light
// signoff and no number, a social comment gets nothing.
// A booking enquiry's line matches the poster's mood (owner's wording, five each). Every line keeps "WhatsApp" and the
// number: the extension attaches the QR picture only to a comment that has both (isSalesComment in replier.js).
export const SALES_CLOSINGS: Record<Mood, string[]> = {
  excited: [
    "Sounds like a brilliant trip. If you'd like a driver who works around your plans instead of a tour schedule, message us on WhatsApp {n} and we'll sort out the details with you.",
    "What a trip to look forward to! When you're ready to lock in the transport, WhatsApp us on {n} and we'll fit it around your days.",
    "You're going to love it. Send your dates to WhatsApp {n} and we'll help you get between places without the hassle.",
    "Love this plan. If you want a private car so you can stop wherever you like along the way, our WhatsApp is {n}.",
    "Exciting times! Drop us a message on WhatsApp {n} whenever you'd like help putting the days together.",
  ],
  stressed: [
    "If it helps to take one thing off your list, send your flight time and hotel to WhatsApp {n} and we'll confirm a car for you quickly.",
    "Don't worry, this is easy to sort out. Message us on WhatsApp {n} with where you are and where you need to be, and we'll take it from there.",
    "Send the details to WhatsApp {n} now and you'll have an answer from us shortly, so you can stop thinking about it.",
    "Late arrivals are something we handle all the time. WhatsApp {n} with your flight number and we'll plan the pickup around it.",
    "If you'd rather have it settled tonight, our WhatsApp is {n}. Just tell us the pickup, drop-off and time.",
  ],
  family: [
    "With kids it's so much easier when the car waits for you, not the other way round. Send your dates and how many of you are travelling to WhatsApp {n} and we'll suggest the right size of vehicle.",
    "Travelling with family is much calmer when you can stop whenever someone needs a break. Message us on WhatsApp {n} and we'll plan the days at your pace.",
    "Tell us who's coming and how many bags you have on WhatsApp {n}, and we'll make sure everyone and everything fits comfortably.",
    "If you'd like the days planned around naps, snacks and slower walkers, WhatsApp {n} and we'll put something together with you.",
    "A private car means no rushing for group tour times with the little ones. Our WhatsApp is {n} if you'd like to check your dates.",
  ],
  price: [
    "If you'd like a clear price to compare, WhatsApp {n} with your dates and pickup point. No pressure, we'll just give you the number.",
    "Send the route and date to WhatsApp {n} and we'll reply with one all-in price, so it's easy to compare.",
    "For a group your size, splitting one car often works out well per person. Message WhatsApp {n} and we'll give you an exact figure.",
    "Happy to give you a price to weigh up against other options. Our WhatsApp is {n}, just tell us where and when.",
    "WhatsApp {n} with the details and we'll send you a straightforward quote.",
  ],
  unsure: [
    "If you're still shaping the plan, drop us a message on WhatsApp {n}. Happy to talk it through first and book only when it feels right.",
    "No need to have it all figured out yet. Message us on WhatsApp {n} with the dates you have, and we'll help you work out the rest.",
    "First trips to Thailand come with lots of questions, and that's normal. Ask us anything on WhatsApp {n}, no booking needed.",
    "If it helps to talk it over with someone local, our WhatsApp is {n}. We can suggest a plan and you decide from there.",
    "Tell us roughly what you enjoy and how many days you have on WhatsApp {n}, and we'll suggest a few ideas to start from.",
  ],
};
/** A post with no clear mood gets a line that suits anyone: the price and unsure sets. */
const NEUTRAL_CLOSINGS = [...SALES_CLOSINGS.price, ...SALES_CLOSINGS.unsure];
export const closingsFor = (mood: Mood | "none" | undefined) => (mood && mood !== "none" && SALES_CLOSINGS[mood]) || NEUTRAL_CLOSINGS;

/**
 * The closing a group has seen least lately: one it has not seen in its recent comments (newest first), else the one
 * used longest ago, so a group sees every line of a mood before one comes back. The seed breaks ties.
 */
export function pickClosing(mood: Mood | "none" | undefined, whatsapp: string, recent: readonly string[], seed: number): string {
  const lines = closingsFor(mood).map((l) => l.replace("{n}", whatsapp));
  const lastUse = (line: string) => { const i = recent.findIndex((c) => c.includes(line)); return i < 0 ? Infinity : i; };
  const oldest = Math.max(...lines.map(lastUse));
  return pick(lines.filter((l) => lastUse(l) === oldest), seed);
}
export const SIGNOFFS = [
  "For more local-style travel recommendations, have a look at Waydidi Travel.",
  "If you enjoy Thailand travel tips like this, we share more at Waydidi Travel.",
  "More Thailand tips and local travel ideas at Waydidi Travel.",
];
export { WHATSAPP as DEFAULT_WHATSAPP } from "./contact";
export const pick = <T,>(list: T[], seed: number) => list[Math.abs(Math.floor(seed)) % list.length];

/** Removes em dashes (the playbook never uses them) and tidies spaces. */
export const cleanComment = (s: string) => s.replace(/\s*—\s*/g, ", ").replace(/ +,/g, ",").replace(/[ \t]{2,}/g, " ").trim();

/** `closing`: the poster's mood and the group's recent comments, so the sales line fits the post and rotates per group. */
export function withClosing(type: ReplyType, comment: string, whatsapp: string, seed: number, closing: { mood?: Mood | "none"; recent?: readonly string[] } = {}): string {
  const body = cleanComment(comment);
  if (type === "sales" || type === "adjacent") return /whatsapp/i.test(body) ? body : `${body}\n\n${pickClosing(closing.mood, whatsapp, closing.recent ?? [], seed)}`;
  if (type === "info") return /waydidi/i.test(body) ? body : `${body}\n\n${pick(SIGNOFFS, seed)}`;
  return body;
}

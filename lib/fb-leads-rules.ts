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

/** What the extension saw on the page itself: comments turned off, or Waydidi already commented or reacted. */
export type PageSkip = "commenting_disabled" | "already_engaged";
export type IncomingPost = PostRef & { groupName: string; text: string; skip?: PageSkip };
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
    const skip = p.skip === "commenting_disabled" || p.skip === "already_engaged" ? p.skip : undefined; // anything else is ignored
    posts.push({ ...ref, groupName: name || ref.groupKey, text, ...(skip ? { skip } : {}) });
  });
  return { posts, rejected };
}

// A browser extension sees every post in a busy group (photos, chat, adverts). This cheap check keeps those out of the
// AI queue, so the daily limit goes to posts where someone asks or needs something. It is deliberately broad: a question
// mark, or a word about asking, transport, tours, food, nightlife or plans in English, Thai, Chinese, Russian or Korean.
// The AI still decides what a lead is.
const REQUEST_WORDS = /recommend|looking for|look for|anyone|anybody|any ideas|suggest|how to|how do|how much|how can|how far|how many days|where|which|what is|what's|best way|best time|can i|can we|should i|need|advice|tips|help|driver|transfer|taxi|grab|bolt|\btour|\bvan\b|rent|ferry|airport|visa|itinerary|\bplan(?:ning)?\b|island hopping|nightlife|night ?life|restaurant|where to eat|food|bar\b|แนะนำ|ช่วย|รบกวน|ใครรู้|ไหม|มั้ย|หรือไม่|ที่ไหน|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|อะไร|หา|ต้องการ|รถ|คนขับ|เหมา|ทัวร์|เที่ยว|ร้านอาหาร|เที่ยวกลางคืน|แพลน|กี่วัน|ร้าน|推荐|请问|求|有没有|怎么|多少钱|包车|接机|送机|司机|哪里|哪个|攻略|需要|餐厅|夜生活|行程|подскаж|посовету|где\b|как добраться|сколько стоит|трансфер|такси|экскурси|водител|помогите|кто знает|ищу|нужен|нужна|추천|어디|어떻게|얼마|택시|투어|기사님|공항|픽업|맛집|알려주세요|있나요|가능한가요/i;
export const looksLikeRequest = (text: string) => /[?？]/.test(text) || REQUEST_WORDS.test(text);

// Posts Waydidi should not answer even when they look like requests: other businesses' adverts and promotions, and
// people looking for a long stay (a month or more) in a room, condo or house. Word lists, so they are tuned here (one
// place, no extension reload). They are rules of thumb: a seeker's own words ("looking for", "anyone", "recommend")
// always win over a promo word, and a stay post that also mentions a driver, transfer or tour is kept.
const PROMO_WORDS = /for rent|for sale|rental (?:rates?|price)|(?:private )?viewings?\b|ให้เช่า|ปล่อยเช่า|ทักแชท|ทักไลน์|สนใจทัก|นัดหมายเข้าชม|สอบถามรายละเอียดเพิ่มเติม|สอบถามราคา|出租|出售|book now|special (?:price|offer|deal)|promotion|promo\b|discount|\d\s?% ?off|contact us|message us|dm us|inbox us|call us|whatsapp us|we (?:offer|provide)|our (?:tours?|services?|team|drivers?|cars?|vans?|villas?|hotel|resort|rooms?)\b|ราคาพิเศษ|โปรโมชั่น|โปรโมชัน|ติดต่อสอบถาม|สอบถามได้|รับจอง|ให้บริการ|ลดราคา|ลดพิเศษ|สนใจติดต่อ|จองได้เลย|优惠|促销|欢迎咨询|欢迎联系|特价/i;
const SEEKER_WORDS = /looking for|look for|anyone|anybody|recommend|suggest|need a|need an|does anyone|can anyone|can someone|any ideas|ใครมี|ใครรู้|ใครเคย|แนะนำ|有没有|请问|求|推荐|ищу|кто знает|подскаж|посовету|추천|알려주세요/i;
// Contact details for people to reach the poster: a phone number (Thai or international), a LINE ID, a WhatsApp number
// or a wa.me link. The owner's rule: a post that gives these is an advert.
const CONTACT = /(?:\+\s?66|\b0)[\s-]?\d[\d\s-]{7,}|\+\d{1,3}[\s-]?\d[\d\s-]{6,}|line\s*(?:id)?\s*[:：@]|ไลน์\s*(?:ไอดี)?\s*[:：@]|ไอดีไลน์|whatsapp\s*[:：]?\s*\+?\d|wa\.me/i;
/**
 * An advert or promotion: advert words, unless the poster is plainly asking; or contact details, unless the poster is
 * plainly asking and uses no advert words (a traveller who adds their own WhatsApp while asking for a driver is a lead).
 */
export const isPromo = (text: string) => {
  const seeker = SEEKER_WORDS.test(text), promo = PROMO_WORDS.test(text), contact = CONTACT.test(text);
  return (promo && !seeker) || (contact && (!seeker || promo));
};

const STAY_TERM = /\b(?:[1-9]\d?|one|two|three|four|five|six|a)\s*\+?\s*months?\b|monthly|per month|\/\s*month|long[- ]?term|yearly|annual(?:ly)?|per year|\/\s*year|รายปี|年租|包年|[1-9]\d?\s*เดือน|รายเดือน|เช่าระยะยาว|ระยะยาว|长租|月租|长期|[一二三四五六七八九十\d]+个月/i;
const STAY_PLACE = /rent|rental|room|apartment|condo|house|villa|accommodation|accomodation|\bstay|hostel|studio|bungalow|ห้อง|คอนโด|บ้าน|หอพัก|ที่พัก|อพาร์ทเมนท์|公寓|租房|住宿/i;
const TRANSPORT_WORDS = /driver|transfer|taxi|\btours?\b|\bvan\b|\bcar\b|minibus|pick ?up|รถ|คนขับ|ทัวร์|รับส่ง|包车|接机|司机/i;
export const isLongStay = (text: string) => STAY_TERM.test(text) && STAY_PLACE.test(text) && !TRANSPORT_WORDS.test(text);

// More posts Waydidi does not answer (owner's targeting rules, November 2026). Word lists in English, Thai, Chinese,
// Russian and Korean; the AI sorter catches what they miss.
const GIVEAWAY = /giveaway|give ?away|chance to win|win (?:a|free)\b|free tickets?|lucky draw|แจกฟรี|แจก|ลุ้นรับ|ลุ้นรางวัล|抽奖|赠送|розыгрыш|경품|당첨/i;
const BAIT = /comment\s*["“']?(?:yes|amen|1)\b|type\s*["“']?(?:yes|amen|1)\b|like if|share if|tag (?:a|your) (?:friend|buddy|mate|someone)|who agrees|say yes if|ใครเห็นด้วย|พิมพ์\s*(?:ใช่|yes|1)|แท็กเพื่อน|กดไลค์ถ้า|点赞|转发|ставь лайк|좋아요 누르/i;
const SPAM = /bit\.ly|tinyurl|t\.me\/|crypto|bitcoin|forex|usdt|investment (?:plan|opportunity)|passive income|work from home|earn \$?\d+|per day income|หารายได้|รายได้เสริม|งานออนไลน์|สินเชื่อ|เงินกู้|กู้เงิน|loan offer|赚钱|兼职|заработ|부업/i;
const SOLVED = /update\s*[:\-–]\s*(?:booked|solved|found|sorted|done|all good|got it)|\b(?:solved|sorted now|no longer needed|not needed any ?more|found one,? thanks|thanks all,? found)\b|ได้แล้ว(?:ค่ะ|ครับ|นะ|ขอบคุณ)|เจอแล้ว|จองแล้ว|已解决|已找到|уже нашли|해결/i;
const ADMIN_POST = /^\s*(?:📌\s*)?(?:group )?rules?\b|group rules|admin(?:istrator)? (?:note|notice|announcement|here)|announcement from (?:the )?admin|pinned post|กฎของกลุ่ม|กฎกลุ่ม|ประกาศจากแอดมิน|แอดมินขอ|แอดมินแจ้ง|群规|管理员公告|правила группы|공지사항/i;
const NOT_SERVED = /we are hiring|\bhiring\b|job (?:vacancy|opening|offer)|looking for (?:a )?job|รับสมัครงาน|หางาน|ตำแหน่งงาน|招聘|找工作|вакансия|구인|flatmate|roommate|housemate|รูมเมท|เพื่อนร่วมห้อง|室友|合租|\blost (?:my )?(?:phone|wallet|bag|passport|keys?|dog|cat)|\bfound (?:a |this )?(?:phone|wallet|bag|passport|keys?|dog|cat)|ของหาย|เก็บได้|丢失|捡到|selling my|second ?hand|มือสอง|二手|\b(?:puppy|puppies|kitten)s?\b|adopt (?:a )?(?:dog|cat|pet)|หาบ้านให้(?:น้อง|หมา|แมว)|รับเลี้ยง|宠物/i;
const EMERGENCY = /\b(?:emergency|ambulance|police|accident|lawyer|legal advice|arrested|got scammed)\b|ฉุกเฉิน|อุบัติเหตุ|ตำรวจ|ทนาย|急救|警察|律师|полиция|경찰/i;
// "No agents, please": still a lead, but the comment is help only, with no Waydidi offer (a sales reply would be reported).
const NO_AGENTS = /no agents?\b|no sellers?\b|no tour (?:agents?|companies)|no (?:dms?|pms?)\b|no business(?:es)?\b|private (?:people|persons?) only|ไม่รับนายหน้า|ไม่เอานายหน้า|ไม่รับเอเจนซี่|ไม่รับคนขาย|不要中介|中介勿扰|без посредников|업체 사절/i;
export const noSalesPitch = (text: string) => NO_AGENTS.test(text);

// Seen on the owner's first real run (7 Nov 2026), caught by the AI before; now free:
// a shop or venue promoting itself (even with "recommend", which otherwise marks someone asking) …
const SHOP_AD = /we(?:'|’)?d (?:like|love) to (?:recommend|invite|introduce)|(?:visit|try|come to|join us at) our (?:shop|restaurant|bar|cafe|café|place|resort|spa|kitchen)|\bour (?:shop|restaurant|bar|cafe|café|kitchen|menu|spa|massage)\b|we(?:'re| are) open\b|we open (?:at|from|daily|tonight)|open (?:daily|every day) from|ร้านเปิด|ร้านปิด|เปิดให้บริการ|แวะมาได้|ร้านเรา|欢迎光临/i;
// … invitations that sell company or massage …
const INVITATION = /wanna feel|feel something different|(?:have|having) a good time with (?:us|me)|(?:dm|pm|inbox) me for|happy ending|outcall|massage (?:service|at your)|นวดนอกสถานที่|เอ็นเตอร์เทน/i;
// … lost and found for any item …
// (losing something somewhere, or "anyone found…"; "I lost my booking, how do I get the ferry?" is still a question)
const LOST_FOUND = /\blost (?:my|our|her|his) [^.?!\n]{1,40}? (?:at|around|near|in|on|from) |anyone (?:found|seen) (?:a|an|my|our|them|it)\b|found (?:a|an|this) [^.?!\n]{1,30}? (?:on|at|near|around) |ของหาย|ทำ\S{0,12}หาย|ใครเก็บได้|捡到|丢了/i;
// … and new members saying hello (a new member who also asks something is still a lead).
const INTRO = /\bnew (?:member|here|to (?:the|this) group)\b|just (?:want(?:ed)? to )?say (?:hello|hi)\b|\bmy name is\b|สมาชิกใหม่|ฝากเนื้อฝากตัว|新成员|新人报到/i;

export type SkipReason = "promo" | "long_stay" | "giveaway" | "bait" | "spam" | "solved" | "admin_post" | "intro" | "not_served" | "no_request";

/** Whether a post goes to the AI queue, and if not, why (stored as skip_reason, so the rules can be tuned from real posts). */
export function screenPost(text: string): { queue: true } | { queue: false; reason: SkipReason } {
  if (SPAM.test(text)) return { queue: false, reason: "spam" };
  if (GIVEAWAY.test(text)) return { queue: false, reason: "giveaway" };
  if (BAIT.test(text)) return { queue: false, reason: "bait" };
  if (ADMIN_POST.test(text)) return { queue: false, reason: "admin_post" };
  if (isPromo(text) || SHOP_AD.test(text) || INVITATION.test(text)) return { queue: false, reason: "promo" };
  if (isLongStay(text)) return { queue: false, reason: "long_stay" };
  if (SOLVED.test(text)) return { queue: false, reason: "solved" };
  // Emergencies are not Waydidi's to answer, unless the person asks for transport (a driver to a hospital is a lead).
  if (NOT_SERVED.test(text) || LOST_FOUND.test(text) || (EMERGENCY.test(text) && !TRANSPORT_WORDS.test(text))) return { queue: false, reason: "not_served" };
  if (INTRO.test(text) && !SEEKER_WORDS.test(text) && !/[?？]/.test(text)) return { queue: false, reason: "intro" };
  if (!looksLikeRequest(text)) return { queue: false, reason: "no_request" };
  return { queue: true };
}

/**
 * Strong leads are drafted first (the order changes, not whether a post is collected): travel dates +2, a clear
 * from–to route +2, a number of people +1, a transport or tour word +1. 0 to 6.
 */
const DATES = /\b(?:\d{1,2}(?:st|nd|rd|th)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2})\b|\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b(?:tomorrow|tonight|next (?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this (?:weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b|พรุ่งนี้|มะรืน|วันที่\s*\d|\d{1,2}\s*(?:ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)|明天|后天|\d{1,2}月\d{1,2}[日号]|завтра|내일|\d{1,2}월\s*\d{1,2}일/i;
const ROUTE = /\bfrom\s+\S.{1,40}?\s+to\s+\S|→|->|จาก\S.{0,30}?ไป\S|从.{1,15}?到|из\s+\S.{1,30}?\s+в\s+\S|에서\s*\S{1,15}\s*까지/i;
const PEOPLE = /\b\d{1,2}\s*(?:people|pax|persons?|adults?|kids?|children|of us|guests?|travell?ers)\b|family of \d|\d{1,2}\s*คน|\d{1,2}\s*(?:位|人)|\d{1,2}\s*человек|\d{1,2}\s*명/i;
export function leadPriority(text: string) {
  return (DATES.test(text) ? 2 : 0) + (ROUTE.test(text) ? 2 : 0) + (PEOPLE.test(text) ? 1 : 0) + (TRANSPORT_WORDS.test(text) ? 1 : 0);
}

/** Same post text in another group (people copy one question into several groups): normalised for comparison. */
export const normalisedText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** Posts a comment can help with. Social chat (introductions, "anyone here this week") is not a lead. */
export const isLead = (replyType: string) => replyType === "sales" || replyType === "adjacent" || replyType === "info";

/**
 * Ready to post only when at least one fact passed the source checks and saved knowledge is not out of date.
 * Otherwise the draft is still sent, marked "Needs your check" with the reason.
 */
export function reliability(d: { factCount: number; stale: boolean; replyType?: string; searched?: boolean }): { reliable: true } | { reliable: false; reason: string } {
  if (d.stale) return { reliable: false, reason: "the saved facts are time-sensitive and over 3 months old" };
  // A booking request is answered with the Waydidi offer and one question, without a web search: it has no web facts
  // to check, so it is ready to post. (The price, if any, comes from Waydidi's own price table.)
  if (d.replyType === "sales" && d.searched === false && d.factCount < 1) return { reliable: true };
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

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
export type Routed = { language: "en" | "th" | "zh" | "other"; kind: "transport" | "travel" | "other"; topic: string; question: string; timeSensitive: boolean; route: Route | null };
export function parseRouted(raw: string): Routed | null {
  const o = jsonObject(raw);
  if (!o) return null;
  const topic = topicKey(text(o.topic, 80)), question = text(o.question, 200);
  if (!topic || !question) return null;
  const r = o.route && typeof o.route === "object" ? o.route as Record<string, unknown> : null;
  const n = (v: unknown, d: number, max: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : d; };
  const route = r && text(r.pickup, 120) && text(r.dropoff, 120) ? { pickup: text(r.pickup, 120), dropoff: text(r.dropoff, 120), passengers: Math.max(1, n(r.passengers, 2, 30)), bags: n(r.bags, 2, 40) } : null;
  return { language: o.language === "th" || o.language === "zh" || o.language === "en" ? o.language : "other", kind: o.kind === "transport" ? "transport" : o.kind === "travel" ? "travel" : "other", topic, question, timeSensitive: o.timeSensitive === true, route };
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
export function parseComposed(raw: string): { comment: string; template: string | null } | null {
  const o = jsonObject(raw);
  const comment = multiline(o?.comment, 1500);
  if (!comment) return null;
  return { comment, template: multiline(o?.template, 1500) || null };
}

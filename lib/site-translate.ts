import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";
import { SITE_LANGS, STYLE, TX_MODEL, type SiteLang } from "@/lib/site-languages";

// Site-wide AI translation. Each English text is translated once per language by Claude, stored
// in D1 and served from there to every visitor. Staff can correct any line (it's then "reviewed"
// and never re-translated).

export const TRANSLATE_MODEL = TX_MODEL.id;
const DAILY_LIMIT = 30000; // new strings per day across all languages (cost guard)
const BATCH = 30;

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const vars = () => env as unknown as Record<string, string | undefined>;
export const translationConfigured = () => Boolean(vars().ANTHROPIC_API_KEY);
export const textHash = (s: string) => sha256(`v1:${s}`);
const today = () => new Date().toISOString().slice(0, 10);

/** Cached translations for these texts; missing ones are left out. */
export async function cachedTranslations(lang: SiteLang, texts: string[]) {
  const out = new Map<string, string>();
  const hashes = await Promise.all(texts.map(textHash));
  for (let i = 0; i < texts.length; i += 90) {
    const part = hashes.slice(i, i + 90);
    const rows = await db().prepare(`SELECT hash,text FROM site_translations WHERE lang=? AND hash IN (${part.map(() => "?").join(",")})`).bind(lang, ...part).all<{ hash: string; text: string }>();
    const byHash = new Map(rows.results.map((r) => [r.hash, r.text]));
    part.forEach((h, j) => { const t = byHash.get(h); if (t !== undefined) out.set(texts[i + j], t); });
  }
  return out;
}

const SYSTEM = (lang: SiteLang) => {
  const name = SITE_LANGS.find((l) => l.code === lang)!.english;
  return `You translate the website of Waydidi, a private car transfer and driver service in Thailand, from English into ${name}.

Style: ${STYLE[lang as Exclude<SiteLang, "en">]}
Write the way a professional native-speaking travel company would: accurate, natural, polite and reassuring. Never add, drop or soften information: prices, times, refund percentages, deadlines and conditions must mean exactly the same as the English.

Rules:
- Keep unchanged: the brand names "Waydidi" and "Non", booking references (e.g. MC7Q2P), email addresses, phone numbers, URLs, currency codes (THB, USD), numbers, dates, times and {placeholders} in braces.
- Place names: use the standard name travellers from that language know (e.g. official exonyms); if there is none, keep the English.
- Car models and flight numbers stay as written.
- Short UI labels (buttons, menu items, table headings) stay short; match the capitalisation conventions of ${name}.
- Each item is one independent text fragment from the page (it may be part of a sentence split by a link or bold text): translate it so it still reads naturally in place, keep leading/trailing punctuation.
- If an item is already not English, or is only a name/code, return it unchanged.

Input: a JSON object of numbered texts, e.g. {"1": "Book a ride", "2": "From"}. Output: ONLY a JSON object with the same numbers and the translations, e.g. {"1": "…", "2": "…"}. Every number must be present. No comments.`;
};

async function callClaude(lang: SiteLang, texts: string[]) {
  const client = new Anthropic({ apiKey: vars().ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: TRANSLATE_MODEL, max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM(lang), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(Object.fromEntries(texts.map((t, i) => [String(i + 1), t]))) }],
  });
  const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  // Lenient: take whatever numbered items came back; anything missing is simply tried again later.
  let obj: Record<string, unknown> = {};
  try { obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { obj = {}; }
  const out = texts.map((_, i) => (typeof obj[String(i + 1)] === "string" && (obj[String(i + 1)] as string).trim() ? obj[String(i + 1)] as string : null));
  const u = res.usage;
  const usd = ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * TX_MODEL.inUsd + u.output_tokens * TX_MODEL.outUsd) / 1e6;
  return { out, usd };
}

/** Claims room in today's budget; returns how many strings may be translated now. */
async function claimBudget(n: number) {
  const row = await db().prepare("INSERT INTO site_translation_usage(day,strings) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET strings=strings+excluded.strings WHERE strings+excluded.strings<=? RETURNING strings")
    .bind(today(), n, DAILY_LIMIT).first<{ strings: number }>();
  return row ? n : 0;
}

/** Translates and stores the texts that aren't cached yet. Returns the new translations. */
export async function translateMissing(lang: SiteLang, texts: string[], path: string | null) {
  const done = new Map<string, string>();
  if (!translationConfigured() || !texts.length) return done;
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) batches.push(texts.slice(i, i + BATCH));
  // Up to 4 batches at a time, so a whole page is ready in a few seconds.
  for (let k = 0; k < batches.length; k += 4) {
    await Promise.all(batches.slice(k, k + 4).map(async (part) => {
      if (!await claimBudget(part.length)) return;
      let result: { out: (string | null)[]; usd: number } | null = null;
      try { result = await callClaude(lang, part); } catch (e) { console.error("translation failed", e instanceof Error ? e.message : "unknown"); }
      if (!result) return;
      // One retry for items the model skipped.
      const skipped = part.filter((_, j) => !result!.out[j]);
      if (skipped.length && skipped.length < part.length) {
        const again = await callClaude(lang, skipped).catch(() => null);
        if (again) { let n = 0; result.out = result.out.map((t) => t ?? again.out[n++] ?? null); result.usd += again.usd; }
      }
      const now = new Date().toISOString();
      const stmts: Stmt[] = [];
      for (let j = 0; j < part.length; j++) {
        const text = result.out[j];
        if (!text) continue;
        done.set(part[j], text);
        // A staff correction ("reviewed") is never overwritten.
        stmts.push(db().prepare("INSERT INTO site_translations(lang,hash,source,text,status,path,created_at,updated_at) VALUES(?,?,?,?,'machine',?,?,?) ON CONFLICT(lang,hash) DO NOTHING")
          .bind(lang, await textHash(part[j]), part[j], text, path, now, now));
      }
      stmts.push(db().prepare("UPDATE site_translation_usage SET usd=usd+? WHERE day=?").bind(result.usd, today()));
      await db().batch(stmts);
    }));
  }
  return done;
}

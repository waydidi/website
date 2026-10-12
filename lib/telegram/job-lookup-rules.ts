// Recognising "give me the job for Tayla" in the team Telegram group. Pure (no runtime
// imports) so it is unit tested directly (tests/telegram-job-lookup.test.mjs).

// Words that ask for a driver job message, in English and Thai.
const KEYWORD = /(?:^|[\s/])(assignments?|assign|jobs?|ใบงาน|งาน)(?:@\w+)?(?=$|[\s:,.?!])/iu;
// Polite and filler words around the name that are not part of it.
const FILLER = /^(?:give|me|show|send|get|find|please|pls|can|could|you|i|need|want|the|a|an|for|of|to|is|what|whats|what's|ขอ|ของ|ให้|หน่อย|ด้วย|ครับ|ค่ะ|คะ|นะ|คุณ|ลูกค้า|ชื่อ)$/iu;

export const LOOKUP_MAX_RESULTS = 5;

/** The name or booking reference asked for, or null when the message is not a job request. */
export function parseJobLookup(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 120) return null;
  const match = t.match(KEYWORD);
  if (!match || match.index === undefined) return null;
  const words = (s: string) => s.replace(/[?!.,:;"“”'‘’()]/g, " ").split(/\s+/).filter(Boolean);
  // Only a request: everything before the keyword must be polite filler ("give me", "ขอ").
  // "Good job everyone" is talk, not a lookup.
  if (!words(t.slice(0, match.index)).every((w) => FILLER.test(w))) return null;
  const query = words(t.slice(match.index + match[0].length)).filter((w) => !FILLER.test(w)).join(" ").trim();
  return query.length >= 2 && query.length <= 60 ? query : null;
}

/** A booking reference typed on its own (e.g. FMBNUW), matched exactly. */
export const looksLikeReference = (query: string) => /^[A-Z0-9]{5,12}$/i.test(query) && /\d|^[A-Z]{6}$/i.test(query);

/** SQL LIKE pattern for a name, with the user's % and _ treated literally (ESCAPE '\'). */
export const namePattern = (query: string) => `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Today's date in Bangkok as YYYY-MM-DD. */
export const bangkokToday = (now = Date.now()) => new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);

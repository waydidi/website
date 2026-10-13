// Recognising "give me the job for Tayla" in the team Telegram group. Pure (no runtime
// imports) so it is unit tested directly (tests/telegram-job-lookup.test.mjs).

// Words that ask for a driver job message, in English and Thai.
const KEYWORD = /(?:^|[\s/])(assignments?|assign|jobs?|ใบงาน|งาน)(?:@\w+)?(?=$|[\s:,.?!])/iu;
// Polite and filler words around the name that are not part of it.
const FILLER = /^(?:give|me|show|send|get|find|please|pls|can|could|you|i|need|want|the|a|an|for|of|to|is|what|whats|what's|ขอ|ของ|ให้|หน่อย|ด้วย|ครับ|ค่ะ|คะ|นะ|คุณ|ลูกค้า|ชื่อ)$/iu;

// Asking for a booking's reference: "Give me Tayla ref id", "ref for Tayla", "เลขจอง Tayla".
const REF_KEYWORD = /(?:^|\s)(ref(?:erence)?(?:\s*(?:id|no\.?|number|code))?|booking(?:\s*(?:id|ref|no\.?|number|code))?|เลขจอง|เลขที่จอง|รหัสจอง)(?=$|[\s:,.?!'’s])/iu;
// A request opener, so "Tayla booking is done" stays ordinary talk.
const OPENER = /^(?:give|show|send|get|find|what|whats|what's|please|pls|can|could|ขอ)$/iu;

export const LOOKUP_MAX_RESULTS = 5;

/** The name or booking reference asked for, or null when the message is not a job request. */
export function parseJobLookup(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 120) return null;
  const words = (s: string) => s.replace(/(\w)['’]s\b/g, "$1").replace(/[?!.,:;"“”'‘’()]/g, " ").split(/\s+/).filter(Boolean);
  const match = t.match(KEYWORD);
  if (!match || match.index === undefined) return refLookup(t, words);
  // Only a request: everything before the keyword must be polite filler ("give me", "ขอ").
  // "Good job everyone" is talk, not a lookup.
  if (!words(t.slice(0, match.index)).every((w) => FILLER.test(w))) return null;
  const query = words(t.slice(match.index + match[0].length)).filter((w) => !FILLER.test(w)).join(" ").trim();
  return query.length >= 2 && query.length <= 60 ? query : null;
}

/** "Give me Tayla ref id" / "ref for Tayla": the name may come before or after the keyword. */
function refLookup(t: string, words: (s: string) => string[]) {
  const match = t.match(REF_KEYWORD);
  if (!match || match.index === undefined) return null;
  const before = words(t.slice(0, match.index)), after = words(t.slice(match.index + match[0].length));
  if (!(match.index === 0 || OPENER.test(before[0] ?? ""))) return null;
  const query = [...before, ...after].filter((w) => !FILLER.test(w) && !/^(id|no|number|code|ref|reference|booking)$/i.test(w)).join(" ").trim();
  return query.length >= 2 && query.length <= 60 ? query : null;
}

/** A booking reference typed on its own (e.g. FMBNUW), matched exactly. */
export const looksLikeReference = (query: string) => /^[A-Z0-9]{5,12}$/i.test(query) && /\d|^[A-Z]{6}$/i.test(query);

/** SQL LIKE pattern for a name, with the user's % and _ treated literally (ESCAPE '\'). */
export const namePattern = (query: string) => `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Today's date in Bangkok as YYYY-MM-DD. */
export const bangkokToday = (now = Date.now()) => new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);

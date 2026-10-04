import { env } from "cloudflare:workers";

// Cee's knowledge: short notes staff write (rules, places, tips, FAQs), plus the trip planner's
// attraction database. Cee searches it with a tool; it never reads everything at once.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

export const KINDS = ["rule", "place", "tip", "faq"] as const;
export type Kind = (typeof KINDS)[number];
export type Note = { id: string; title: string; kind: Kind; city: string | null; body: string; active: number; source: string; created_by: string | null; created_at: string; updated_at: string };
export type NoteInput = { title: string; kind: Kind; city?: string | null; body: string; active?: boolean; source?: string; createdBy?: string | null };

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
export function validNote(input: Record<string, unknown>): NoteInput | string {
  const title = clean(input.title, 160), body = clean(input.body, 4000), city = clean(input.city, 60).toLowerCase() || null;
  const kind = KINDS.includes(input.kind as Kind) ? (input.kind as Kind) : "faq";
  if (!title) return "Give the note a title.";
  if (!body) return "Write the note.";
  return { title, body, city, kind, active: input.active !== false };
}

export async function saveNote(input: NoteInput, id?: string) {
  const now = new Date().toISOString();
  if (id) {
    await db().prepare("UPDATE cee_knowledge SET title=?,kind=?,city=?,body=?,active=?,updated_at=? WHERE id=?").bind(input.title, input.kind, input.city ?? null, input.body, input.active === false ? 0 : 1, now, id).run();
    return id;
  }
  const newId = crypto.randomUUID();
  await db().prepare("INSERT INTO cee_knowledge(id,title,kind,city,body,active,source,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(newId, input.title, input.kind, input.city ?? null, input.body, input.active === false ? 0 : 1, input.source ?? "admin", input.createdBy ?? null, now, now).run();
  return newId;
}
export const deleteNote = (id: string) => db().prepare("DELETE FROM cee_knowledge WHERE id=?").bind(id).run();

export async function listNotes(q = "", filter: { kind?: string; active?: string } = {}) {
  const where: string[] = [], binds: unknown[] = [];
  if (q) { where.push("(title LIKE ? OR body LIKE ? OR city LIKE ?)"); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (filter.kind && KINDS.includes(filter.kind as Kind)) { where.push("kind=?"); binds.push(filter.kind); }
  if (filter.active === "1" || filter.active === "0") { where.push("active=?"); binds.push(Number(filter.active)); }
  return (await db().prepare(`SELECT * FROM cee_knowledge ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY active ASC, updated_at DESC LIMIT 300`).bind(...binds).all<Note>()).results;
}

/**
 * Markdown → notes. Each "# " or "## " heading starts a note; optional "kind:" and "city:" lines
 * right under the heading set those fields. Works for one Obsidian note or many pasted together.
 */
export function parseMarkdown(markdown: string, fallbackTitle = "Imported note"): NoteInput[] {
  const notes: NoteInput[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    let kind: Kind = "faq", city: string | null = null;
    const body: string[] = [];
    for (const line of current.lines) {
      const meta = /^(kind|type|city)\s*:\s*(.+)$/i.exec(line.trim());
      if (meta && !body.some((l) => l.trim())) {
        if (meta[1].toLowerCase() === "city") city = meta[2].trim().toLowerCase();
        else if (KINDS.includes(meta[2].trim().toLowerCase() as Kind)) kind = meta[2].trim().toLowerCase() as Kind;
        continue;
      }
      body.push(line);
    }
    // Obsidian [[links]] become plain text.
    const text = body.join("\n").replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a).trim();
    if (text) notes.push({ title: current.title.slice(0, 160), kind, city, body: text.slice(0, 4000) });
  };
  const src = markdown.replace(/^---\n[\s\S]*?\n---\n/, ""); // drop YAML front matter
  for (const line of src.split(/\r?\n/)) {
    const h = /^#{1,2}\s+(.+)$/.exec(line);
    if (h) { flush(); current = { title: h[1].trim(), lines: [] }; }
    else { current ??= { title: fallbackTitle, lines: [] }; current.lines.push(line); }
  }
  flush();
  return notes.slice(0, 200);
}

const terms = (query: string) => {
  const words = query.toLowerCase().split(/[\s,.;:!?/()"']+/).filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set([query.trim().toLowerCase(), ...words])].filter(Boolean).slice(0, 8);
};
const STOP = new Set(["the", "and", "for", "to", "in", "of", "a", "is", "are", "do", "you", "have", "what", "how", "much", "near", "with", "at", "on", "can", "i", "we", "my", "our", "any", "there"]);

/** Best matching notes and attractions for a question, for Cee's search_knowledge tool. */
export async function searchKnowledge(query: string, city?: string | null, limit = 8) {
  const t = terms(query);
  if (!t.length) return { notes: [], places: [] };
  const like = t.map((w) => `%${w}%`);
  const score = (cols: [string, number][]) => t.map(() => cols.map(([c, w]) => `(CASE WHEN LOWER(${c}) LIKE ? THEN ${w} ELSE 0 END)`).join("+")).join("+");
  const noteCols: [string, number][] = [["title", 3], ["body", 1], ["COALESCE(city,'')", 2]];
  const placeCols: [string, number][] = [["name", 3], ["COALESCE(customer_name,'')", 3], ["area", 2], ["category", 2], ["tags_json", 1], ["COALESCE(description,'')", 1]];
  const binds = (cols: number) => like.flatMap((l) => Array(cols).fill(l));
  const cityNorm = city?.toLowerCase().trim() || null;
  const notes = (await db().prepare(`SELECT title,kind,city,body,(${score(noteCols)}) + (CASE WHEN ? IS NOT NULL AND LOWER(COALESCE(city,''))=? THEN 2 ELSE 0 END) score
    FROM cee_knowledge WHERE active=1 AND (? IS NULL OR city IS NULL OR LOWER(city)=?) ORDER BY score DESC LIMIT ?`)
    .bind(...binds(noteCols.length), cityNorm, cityNorm, cityNorm, cityNorm, limit).all<{ title: string; kind: string; city: string | null; body: string; score: number }>().catch(() => ({ results: [] }))).results.filter((n) => n.score > 0);
  const places = (await db().prepare(`SELECT COALESCE(customer_name,name) name,area,category,open_time,close_time,closed_days_json,duration_min,dress_code,description,(${score(placeCols)}) score
    FROM attractions WHERE status='active' ORDER BY score DESC LIMIT ?`)
    .bind(...binds(placeCols.length), Math.ceil(limit / 2)).all<Record<string, unknown> & { score: number }>().catch(() => ({ results: [] }))).results.filter((p) => p.score > 1);
  return {
    notes: notes.map((n) => ({ title: n.title, kind: n.kind, city: n.city, body: n.body.slice(0, 1200) })),
    places: places.map((p) => { const rest: Record<string, unknown> = { ...p }; delete rest.score; return { ...rest, description: typeof p.description === "string" ? p.description.slice(0, 400) : null }; }),
  };
}

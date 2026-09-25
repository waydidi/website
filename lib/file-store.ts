import { env } from "cloudflare:workers";

// Private file storage. Uses the R2 bucket when the account has one; otherwise keeps
// the file in D1, split into ~900 KB parts (D1 rows are limited to about 2 MB).
const PART = 900 * 1024;
type Stored = { body: ReadableStream | ArrayBuffer; contentType: string | null };

type Row = { content_type: string; data: ArrayBuffer | number[] };
type Stmt = { bind: (...v: unknown[]) => Stmt; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
const db = () => env.DB as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };

export async function putFile(key: string, bytes: ArrayBuffer | Uint8Array, contentType: string) {
  if (env.BUCKET) { await env.BUCKET.put(key, bytes, { httpMetadata: { contentType, cacheControl: "private, no-store" } }); return; }
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const now = new Date().toISOString();
  const stmts = [db().prepare("DELETE FROM stored_file_parts WHERE key = ?").bind(key)];
  for (let i = 0, part = 0; i < Math.max(data.length, 1); i += PART, part += 1) {
    stmts.push(db().prepare("INSERT INTO stored_file_parts (key, part, content_type, data, created_at) VALUES (?, ?, ?, ?, ?)").bind(key, part, contentType, data.slice(i, i + PART), now));
  }
  await db().batch(stmts);
}

export async function getFile(key: string): Promise<Stored | null> {
  if (env.BUCKET) {
    const object = await env.BUCKET.get(key);
    return object ? { body: object.body, contentType: object.httpMetadata?.contentType ?? null } : null;
  }
  const { results } = await db().prepare("SELECT content_type, data FROM stored_file_parts WHERE key = ? ORDER BY part").bind(key).all<Row>();
  if (!results.length) return null;
  const parts = results.map((r: Row) => (r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : Uint8Array.from(r.data)));
  const out = new Uint8Array(parts.reduce((n: number, p: Uint8Array) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return { body: out.buffer, contentType: results[0].content_type };
}

export async function deleteFile(key: string) {
  if (env.BUCKET) { await env.BUCKET.delete(key); return; }
  await db().prepare("DELETE FROM stored_file_parts WHERE key = ?").bind(key).run();
}

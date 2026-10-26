import { env } from "cloudflare:workers";
import { privateParts, joinPrivateParts } from "@/lib/private-bytes";

// Private file storage. Uses the R2 bucket when the account has one; otherwise keeps
// the file in D1, split into ~900 KB parts (D1 rows are limited to about 2 MB).
type Stored = { body: ReadableStream | ArrayBuffer; contentType: string | null };

type Row = { content_type: string; data: ArrayBuffer | number[] };
type Stmt = { bind: (...v: unknown[]) => Stmt; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
const db = () => env.DB as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };

export async function putFile(key: string, bytes: ArrayBuffer | Uint8Array, contentType: string) {
  if (env.BUCKET) { await env.BUCKET.put(key, bytes, { httpMetadata: { contentType, cacheControl: "private, no-store" } }); return; }
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const now = new Date().toISOString();
  const stmts = [db().prepare("DELETE FROM stored_file_parts WHERE key = ?").bind(key)];
  privateParts(data).forEach((bytes, part) => stmts.push(db().prepare("INSERT INTO stored_file_parts (key, part, content_type, data, created_at) VALUES (?, ?, ?, ?, ?)").bind(key, part, contentType, bytes, now)));
  await db().batch(stmts);
}

export async function getFile(key: string): Promise<Stored | null> {
  if (env.BUCKET) {
    const object = await env.BUCKET.get(key);
    if (object) return { body: object.body, contentType: object.httpMetadata?.contentType ?? null };
    // Files written straight to the database (for example seeded data) are still found.
  }
  const { results } = await db().prepare("SELECT content_type, data FROM stored_file_parts WHERE key = ? ORDER BY part").bind(key).all<Row>();
  if (!results.length) return null;
  const out = joinPrivateParts(results.map(r => r.data));
  return { body: out.buffer, contentType: results[0].content_type };
}

export async function deleteFile(key: string) {
  // A file may predate the R2 binding. Remove D1 fallback parts as well.
  if (env.BUCKET) await env.BUCKET.delete(key);
  await db().prepare("DELETE FROM stored_file_parts WHERE key = ?").bind(key).run();
}

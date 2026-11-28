import { env } from "cloudflare:workers";
import { deleteFile, putFile } from "@/lib/file-store";
import { ensureFoundationTables, activityRetentionDays, logActivity } from "./activity-log";
import { modelCost, PRICE_TABLE_VERSION, type Usage } from "./model-config";
import {
  EXTRACTION_PROMPT, MAX_FILES_PER_TURN, allowedMediaUrl, factsNote, matchesType, maxBytesFor, parseTripFacts, readableType, type ReadableType,
} from "./media-rules";

// Reads the images and PDFs referenced in whatsapp_media (PR 1 stored only the reference). Each file is
// downloaded once, checked (host, size, type, sha256), kept privately, read by the model without any tools,
// and reduced to validated trip facts. Nothing here can price, book or mark a payment.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const vars = () => env as unknown as Record<string, string | undefined>;

// Same statements as drizzle/0129_sales_ai_media.sql (Workers Builds does not apply D1 migrations).
export const MEDIA_TABLES = [
  `CREATE TABLE IF NOT EXISTS whatsapp_media_reads(media_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('reading','read','refused','failed')),file_key TEXT,sha256 TEXT,bytes INTEGER,mime_type TEXT,facts_json TEXT,reason TEXT,attempts INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS whatsapp_media_reads_conversation ON whatsapp_media_reads(conversation_id,created_at)`,
];
let ready: Promise<unknown> | null = null;
export function ensureMediaTables() {
  ready ??= db().batch(MEDIA_TABLES.map((sql) => db().prepare(sql))).catch((error) => { ready = null; throw error; });
  return ready;
}

class Refused extends Error {}
const graph = () => `https://graph.facebook.com/${/^v\d{1,3}\.\d{1,2}$/.test(vars().WHATSAPP_GRAPH_VERSION ?? "") ? vars().WHATSAPP_GRAPH_VERSION : "v21.0"}`;
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const base64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Media id → bytes. Neither fetch follows a redirect. */
export async function downloadWhatsappMedia(mediaId: string, expectedSha: string | null): Promise<{ bytes: Uint8Array; type: ReadableType; sha256: string }> {
  const auth = { Authorization: `Bearer ${vars().WHATSAPP_TOKEN}` };
  if (!vars().WHATSAPP_TOKEN) throw new Error("WhatsApp media authentication unavailable");
  const info = await fetch(`${graph()}/${encodeURIComponent(mediaId)}`, { headers: auth, redirect: "manual", signal: AbortSignal.timeout(6000) });
  if (!info.ok) throw new Error(`media lookup ${info.status}`);
  const meta = await info.json() as { url?: string; mime_type?: string; file_size?: number; sha256?: string };
  const type = readableType(meta.mime_type);
  if (!type) throw new Refused("unsupported file type");
  const limit = maxBytesFor(type);
  if (Number(meta.file_size) > limit) throw new Refused("file too large");
  const url = meta.url ?? "";
  if (!allowedMediaUrl(url)) throw new Refused("unexpected download host");
  const response = await fetch(url, { headers: auth, redirect: "manual", signal: AbortSignal.timeout(8000) });
  if (!response?.ok || !response.body) throw new Error(`media download ${response?.status ?? "failed"}`);
  if (Number(response.headers.get("content-length")) > limit) { await response.body.cancel().catch(() => undefined); throw new Refused("file too large"); }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => undefined); throw new Refused("file too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  chunks.reduce((at, chunk) => { bytes.set(chunk, at); return at + chunk.byteLength; }, 0);
  if (!size || !matchesType(bytes, type)) throw new Refused("file content does not match its type");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = hex(digest);
  // Meta reports the hash in hex or base64; either must match what arrived.
  for (const claimed of [expectedSha, meta.sha256 ?? null])
    if (claimed && claimed.toLowerCase() !== sha256 && claimed !== base64(digest)) throw new Refused("file hash mismatch");
  return { bytes, type, sha256 };
}

type ModelClient = { beta: { messages: { create: (body: Record<string, unknown>) => Promise<{ content: { type: string; [k: string]: unknown }[]; stop_reason: string | null; usage?: Usage }> } } };

async function extract(client: ModelClient, model: string, bytes: Uint8Array, type: ReadableType) {
  const source = { type: "base64", media_type: type, data: base64(bytes) };
  const res = await client.beta.messages.create({ model, max_tokens: 700, system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content: [type === "application/pdf" ? { type: "document", source } : { type: "image", source }, { type: "text", text: "Report the trip details in this file as the JSON object." }] }] });
  const text = res.stop_reason !== "end_turn" ? "" : res.content.filter((b) => b.type === "text").map((b) => b.text as string).join("\n");
  return { facts: parseTripFacts(text), usage: res.usage };
}

/**
 * Reads this conversation's unread images and PDFs and returns, per WhatsApp message id, the note the assistant
 * sees. A file is read once; a temporary failure is retried at most twice. Never throws.
 */
export async function readConversationMedia(conversationId: string, client: ModelClient, model: string, messageIds: string[]): Promise<{ notes: Map<string, string>; usd: number; requests: number }> {
  const out = { notes: new Map<string, string>(), usd: 0, requests: 0 };
  if (!messageIds.length) return out;
  try {
    await ensureFoundationTables();
    await ensureMediaTables();
    const rows = (await db().prepare(`SELECT m.media_id,m.channel_message_id,m.mime_type,m.sha256,r.status,r.facts_json,r.attempts FROM whatsapp_media m LEFT JOIN whatsapp_media_reads r ON r.media_id=m.media_id
      WHERE m.conversation_id=? AND m.channel_message_id IN (${messageIds.map(() => "?").join(",")}) AND m.kind IN ('image','document') ORDER BY m.received_at DESC LIMIT 40`).bind(conversationId, ...messageIds)
      .all<{ media_id: string; channel_message_id: string; mime_type: string | null; sha256: string | null; status: string | null; facts_json: string | null; attempts: number | null }>()).results;
    let fresh = 0;
    for (const row of rows) {
      if (row.status === "read" && row.facts_json) {
        const facts = parseTripFacts(row.facts_json);
        if (facts) out.notes.set(row.channel_message_id, factsNote(facts));
        continue;
      }
      if (row.status === "refused" || (row.status && (row.attempts ?? 0) >= 3)) continue;
      if (!readableType(row.mime_type) || fresh >= MAX_FILES_PER_TURN) continue;
      const now = new Date().toISOString();
      // Claim before the download, so a crash or a second run counts as an attempt and cannot loop.
      const stale = new Date(Date.now() - 120_000).toISOString();
      const claimed = row.status
        ? await db().prepare("UPDATE whatsapp_media_reads SET attempts=attempts+1,status='reading',updated_at=? WHERE media_id=? AND attempts=? AND (status='failed' OR (status='reading' AND updated_at<?))").bind(now, row.media_id, row.attempts, stale).run()
        : await db().prepare("INSERT OR IGNORE INTO whatsapp_media_reads(media_id,conversation_id,status,created_at,updated_at) VALUES(?,?,'reading',?,?)").bind(row.media_id, conversationId, now, now).run();
      if (!claimed.meta.changes) continue;
      fresh++;
      try {
        const file = await downloadWhatsappMedia(row.media_id, row.sha256);
        const key = `wa-media/${conversationId}/${encodeURIComponent(row.media_id)}`;
        await db().prepare("UPDATE whatsapp_media_reads SET file_key=?,sha256=?,bytes=?,mime_type=?,updated_at=? WHERE media_id=?").bind(key, file.sha256, file.bytes.byteLength, file.type, now, row.media_id).run();
        await putFile(key, file.bytes, file.type);
        const started = Date.now(), { facts, usage } = await extract(client, model, file.bytes, file.type);
        const cost = modelCost(model, usage as Usage);
        out.usd += cost.budgetUsd; out.requests++;
        if (!facts) throw new Error("the reader's answer was not usable");
        await db().prepare("UPDATE whatsapp_media_reads SET status='read',facts_json=?,reason=NULL,updated_at=? WHERE media_id=?").bind(JSON.stringify(facts), new Date().toISOString(), row.media_id).run();
        out.notes.set(row.channel_message_id, factsNote(facts));
        await logActivity({ event: "model_call", status: "ok", actor: "assistant", channel: "whatsapp", conversationId, model, latencyMs: Date.now() - started, inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0,
          costUsd: cost.usd, priceVersion: PRICE_TABLE_VERSION, summary: `Read a customer ${file.type === "application/pdf" ? "PDF" : "image"} (${facts.kind.replace("_", " ")})`, detail: { kind: facts.kind, bytes: file.bytes.byteLength } });
      } catch (error) {
        const refused = error instanceof Refused;
        const reason = refused ? error.message : "download, storage or extraction failed";
        await db().prepare("UPDATE whatsapp_media_reads SET status=?,reason=?,updated_at=? WHERE media_id=?").bind(refused ? "refused" : "failed", reason, new Date().toISOString(), row.media_id).run();
        await logActivity({ event: "media_received", status: refused ? "skipped" : "error", actor: "assistant", channel: "whatsapp", conversationId, dedupeKey: `wa-read:${row.media_id}:${row.attempts ?? 0}`, summary: `Customer file not read: ${reason}` });
      }
    }
  } catch {
    console.error("WhatsApp media reading failed");
  }
  return out;
}

/** Hourly: stored customer files and what was read from them, after the activity-log retention period. */
export async function purgeMediaReads(at = new Date()) {
  await ensureMediaTables();
  const cutoff = new Date(at.getTime() - activityRetentionDays() * 86400000).toISOString();
  const old = (await db().prepare("SELECT media_id,file_key FROM whatsapp_media_reads WHERE created_at<? LIMIT 200").bind(cutoff).all<{ media_id: string; file_key: string | null }>()).results;
  for (const row of old) {
    // The row goes only after its file, so a failed deletion is tried again next hour.
    try {
      if (row.file_key) await deleteFile(row.file_key);
      await db().prepare("DELETE FROM whatsapp_media_reads WHERE media_id=?").bind(row.media_id).run();
    } catch {
      console.error("WhatsApp media retention could not remove a file");
    }
  }
}

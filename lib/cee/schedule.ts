import { env } from "cloudflare:workers";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { conversationById, setBotThinking } from "@/lib/website-chat";
import { ceeEnabled, latestVisitorSeq, runCee } from "./bot";
import { getLimits, spamPaused } from "./guard";

// Non answers 5 s after the customer's latest message, so "hi" / "to Pattaya" / "tomorrow" get one
// reply. In production each chat has a Durable Object whose alarm is pushed back by every new
// message and which can run for minutes (no 30 s request limit). Without it (tests, local dev)
// a background task waits and answers only if no newer message arrived.
export const WAIT_MS = 5000;
type Namespace = { idFromName: (name: string) => unknown; get: (id: unknown) => { fetch: (url: string, init: RequestInit) => Promise<Response> } };

export async function scheduleNon(conversationId: string) {
  if (!(await ceeEnabled())) return;
  const c = await conversationById(conversationId);
  if (!c || c.status === "closed" || c.assigned_name || c.bot_paused) return;
  // Flooding the chat: Non stays quiet for a while and the team is told once.
  if (await spamPaused(c.id)) { await spamNotice(c.id, c.public_id, c.telegram_message_id).catch(() => undefined); return; }
  await setBotThinking(c.id, true); // "Non is typing…" from the first second
  const ns = (env as unknown as { NON_AGENT?: Namespace }).NON_AGENT;
  if (ns) {
    try { await ns.get(ns.idFromName(c.id)).fetch("https://non/schedule", { method: "POST", body: c.id }); return; }
    catch (error) { console.error("non schedule failed", error instanceof Error ? error.message : "unknown"); }
  }
  const seq = await latestVisitorSeq(c.id);
  const job = new Promise((r) => setTimeout(r, WAIT_MS)).then(() => runCee(c.id, { expectSeq: seq }));
  const ctx = getRequestExecutionContext();
  if (ctx) ctx.waitUntil(job); else await job;
}

async function spamNotice(conversationId: string, publicId: string, cardId: number | null) {
  const key = `spam_notice:${conversationId}`;
  const db = env.DB as unknown as { prepare: (s: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<unknown> } } };
  const last = await db.prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>();
  const l = await getLimits();
  if (last && Date.now() - Date.parse(last.value) < l.spamPauseMinutes * 60_000) return;
  await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, new Date().toISOString(), new Date().toISOString()).run();
  const tg = await import("@/lib/telegram/client");
  if (tg.telegramConfigured()) await tg.sendCard(`<b>Many messages in ${publicId}</b>\nMore than ${l.spamMessages} messages in ${l.spamMinutes} minutes. Non has stopped replying to this chat for now; tap Take over to answer yourself.`, undefined, cardId ?? undefined);
}

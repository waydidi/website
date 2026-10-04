import { env } from "cloudflare:workers";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { conversationById, setBotThinking } from "@/lib/website-chat";
import { ceeEnabled, latestVisitorSeq, runCee } from "./bot";

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

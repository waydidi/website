import { env } from "cloudflare:workers";
import { addBotMessage, conversationById, setStatus, type Conversation } from "@/lib/website-chat";
import { esc } from "./cards";
import { editCard, sendCard, telegramConfigured } from "./client";

// When Non hands a chat to the team: a card in the group with [Assign] [Wait].
// "Wait" tells the customer someone is coming, and the card comes back after 10 minutes if
// nobody has taken the chat by then.

const WAIT_MINUTES = 10;
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
type State = { handover?: string; summary?: string; at?: string; card?: number; waitUntil?: string | null; waitedBy?: string };
const state = (c: Conversation): State => { try { return JSON.parse(c.bot_state ?? "{}") as State; } catch { return {}; } };
const save = (id: string, s: State) => db().prepare("UPDATE website_conversations SET bot_state=? WHERE id=?").bind(JSON.stringify(s), id).run();

const text = (c: Conversation, s: State, extra = "") => [
  `<b>Needs a person · ${esc(c.public_id)}</b>`,
  `${esc(c.customer_name || "Website visitor")}${c.customer_email ? ` · ${esc(c.customer_email)}` : ""}`,
  "",
  `Reason: ${esc(s.handover ?? "Non handed over")}`,
  ...(s.summary ? [`<blockquote>${esc(s.summary)}</blockquote>`] : []),
  extra,
].filter((l) => l !== "").join("\n");
const buttons = (id: string) => [[{ text: "Assign", callback_data: `chat_assign:${id}` }, { text: "Wait", callback_data: `chat_wait:${id}` }]];

/** Posts the handover card (as a reply under the chat's card, so the conversation is one tap away). */
export async function postHandoverCard(conversationId: string, extra = "") {
  if (!telegramConfigured()) return;
  const c = await conversationById(conversationId);
  if (!c || c.assigned_name) return;
  const s = state(c);
  const sent = await sendCard(text(c, s, extra), buttons(c.id), c.telegram_message_id ?? undefined);
  await save(c.id, { ...s, card: sent.message_id, waitUntil: null });
}

/** "Wait": the customer is told someone is coming; the card returns in 10 minutes if still unassigned. */
export async function waitHandover(conversationId: string, by: string) {
  const c = await conversationById(conversationId);
  if (!c) return "That conversation no longer exists.";
  if (c.assigned_name) return `Already assigned to ${c.assigned_name}.`;
  const s = state(c);
  if (s.waitUntil && s.waitUntil > new Date().toISOString()) return "Already waiting.";
  const until = new Date(Date.now() + WAIT_MINUTES * 60_000).toISOString();
  await save(c.id, { ...s, waitUntil: until, waitedBy: by });
  await addBotMessage(c.id, "Thanks for waiting. A member of the Waydidi team will be with you in a few minutes.").catch(() => undefined);
  await setStatus(c.id, "pending").catch(() => undefined);
  if (s.card) await editCard(s.card, text(c, s, `${esc(by)} asked the customer to wait · reminder in ${WAIT_MINUTES} min`), [[{ text: "Assign", callback_data: `chat_assign:${c.id}` }]]).catch(() => undefined);
  return `Customer told to wait. Reminder in ${WAIT_MINUTES} minutes.`;
}

/** Called every minute: chats still waiting for a person after their wait time get the card again. */
export async function remindWaiting(now = new Date()) {
  if (!telegramConfigured()) return 0;
  const rows = (await db().prepare(`SELECT id FROM website_conversations WHERE assigned_name IS NULL AND status!='closed'
    AND json_extract(bot_state,'$.waitUntil') IS NOT NULL AND json_extract(bot_state,'$.waitUntil')<? LIMIT 20`).bind(now.toISOString()).all<{ id: string }>()).results;
  for (const r of rows) await postHandoverCard(r.id, "Still waiting for a person (reminder)").catch((e) => console.error("handover reminder failed", e instanceof Error ? e.message : "unknown"));
  return rows.length;
}

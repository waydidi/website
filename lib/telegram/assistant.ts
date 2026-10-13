import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { env } from "cloudflare:workers";
import type { StaffRole } from "@/lib/staff-security";
import { ASSISTANT_TOOLS, runAssistantTool } from "@/lib/telegram/assistant-tools";
import { esc } from "@/lib/telegram/cards";
import { sendCard, tg, telegramChatId } from "@/lib/telegram/client";

// The staff assistant in the team Telegram group: answers questions about Waydidi
// (bookings, drivers, schedule, payments, prices, policies) by calling read-only lookups
// over Waydidi's own data. It cannot change anything and never writes to customers.

export const ASSISTANT_MODEL = "claude-opus-5-5";
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }; // US$ per million tokens
const MAX_STEPS = 6;
const DEFAULT_MONTHLY_USD = 20;

type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined;
type Block = { type: string; [k: string]: unknown };
export type AssistantClient = { beta: { messages: { create: (body: Record<string, unknown>) => Promise<{ content: Block[]; stop_reason: string | null; usage?: Usage }> } } };
export type ToolRunner = (name: string, input: Record<string, unknown>, role: StaffRole) => Promise<string>;

type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<unknown> } } };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
const month = () => new Date().toISOString().slice(0, 7);
const usd = (u: Usage) => ((u?.input_tokens ?? 0) * PRICE.input + (u?.output_tokens ?? 0) * PRICE.output + (u?.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u?.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6;

export const monthlyCapUsd = () => { const v = Number(vars().TELEGRAM_ASSISTANT_MONTHLY_USD); return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MONTHLY_USD; };

async function spentThisMonth() {
  const row = await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(`tg_assistant_usage:${month()}`).first<{ value: string }>().catch(() => null);
  try { return { questions: 0, usd: 0, ...JSON.parse(row?.value ?? "{}") } as { questions: number; usd: number }; } catch { return { questions: 0, usd: 0 }; }
}
async function recordSpend(amount: number) {
  const u = await spentThisMonth();
  await db().prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(`tg_assistant_usage:${month()}`, JSON.stringify({ questions: u.questions + 1, usd: Math.round((u.usd + amount) * 1e5) / 1e5 }), new Date().toISOString()).run().catch(() => undefined);
}

/** On when an API key exists, unless TELEGRAM_ASSISTANT=0. */
export const assistantConfigured = () => Boolean(vars().ANTHROPIC_API_KEY) && vars().TELEGRAM_ASSISTANT !== "0";

/** The staff role a Telegram team member asks with: their linked staff account's, else support (read-only bookings). */
export async function assistantRole(staffId: string | null): Promise<StaffRole> {
  if (!staffId) return "support";
  const row = await db().prepare("SELECT role FROM staff_accounts WHERE id=? AND active=1").bind(staffId).first<{ role: StaffRole }>().catch(() => null);
  return row?.role ?? "support";
}

const bangkokNow = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "full", timeStyle: "short" }).format(new Date());
const todayIso = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export const assistantSystem = (role: StaffRole, name: string, now = bangkokNow(), today = todayIso()) => `You are the Waydidi team assistant in the staff Telegram group. Waydidi is a private car and driver service in Thailand (transfers, hourly car with driver, tours).
Now in Thailand: ${now} (today is ${today}). You are answering ${name}, whose Admin role is "${role}".

Rules:
- Answer only from what the lookups return. Every fact (booking, name, time, price, policy, phone number, money) must come from a lookup in this conversation. Never guess, estimate or fill gaps from memory; if a lookup has nothing, say so plainly.
- Use lookups freely and combine them (e.g. search_bookings, then get_booking). Resolve "today", "tomorrow", "this week" and Thai dates (พ.ศ. 2569 = 2026) to YYYY-MM-DD yourself.
- If a lookup says the role cannot see something, tell ${name} their Admin role doesn't include it. Don't try other lookups to get around it.
- You can't change anything (assign drivers, cancel, refund, message customers). Say which Admin page does it instead.
- Reply in the language of the question (Thai or English). Short and practical, like a colleague in chat. Plain text only, no markdown; one "Label: value" per line for details. Booking references in full. Money in THB as returned.
- When asked for a job / assignment / ใบงาน, give the driver_job_message from get_booking exactly as returned.`;

export type AssistantAnswer = { text: string | null; usd: number; requests: number };

/** One question, answered with up to MAX_STEPS rounds of lookups. Pure apart from the client and runner (testable). */
export async function assistantTurn(question: string, context: { role: StaffRole; name: string; previous?: string | null }, client: AssistantClient, run: ToolRunner = runAssistantTool): Promise<AssistantAnswer> {
  const messages: BetaMessageParam[] = [];
  if (context.previous) messages.push({ role: "user", content: "(earlier question)" }, { role: "assistant", content: context.previous });
  messages.push({ role: "user", content: question });
  const system = [{ type: "text", text: assistantSystem(context.role, context.name), cache_control: { type: "ephemeral" } }];
  const out: AssistantAnswer = { text: null, usd: 0, requests: 0 };
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.beta.messages.create({
      model: ASSISTANT_MODEL, max_tokens: 4000, system, tools: ASSISTANT_TOOLS, tool_choice: { type: "auto" }, messages,
      output_config: { effort: "medium" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    out.requests++; out.usd += usd(res.usage);
    const text = res.content.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n").trim();
    if (res.stop_reason === "refusal") return { ...out, text: "Sorry, I can't answer that one." };
    const uses = res.content.filter((b) => b.type === "tool_use") as unknown as Array<{ id: string; name: string; input: Record<string, unknown> }>;
    if (res.stop_reason !== "tool_use" || !uses.length) return { ...out, text: text || null };
    messages.push({ role: "assistant", content: res.content as BetaMessageParam["content"] });
    const results: BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      let content: string;
      try { content = await run(u.name, u.input ?? {}, context.role); }
      catch (error) { console.error("Assistant lookup failed", u.name, error instanceof Error ? error.message : error); content = JSON.stringify({ ok: false, reason: "This lookup failed; say the information couldn't be loaded right now." }); }
      results.push({ type: "tool_result", tool_use_id: u.id, content: content.slice(0, 60_000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { ...out, text: "That needed too many lookups. Please ask a narrower question." };
}

/** Telegram allows 4,096 characters per message; split long answers on line breaks. */
export function splitForTelegram(text: string, max = 3900) {
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > max && current) { parts.push(current); current = ""; }
    current = current ? `${current}\n${line}` : line.slice(0, max);
  }
  if (current) parts.push(current);
  return parts;
}

/** Answers a team member's question in the group, under their message. */
export async function answerInGroup(question: string, replyTo: number, asker: { name: string; staffId: string | null }, previous: string | null) {
  const spent = await spentThisMonth();
  if (spent.usd >= monthlyCapUsd()) {
    await sendCard(`The assistant has reached this month's spending limit (US$${monthlyCapUsd()}). The owner can raise TELEGRAM_ASSISTANT_MONTHLY_USD in Cloudflare.`, undefined, replyTo);
    return;
  }
  await tg("sendChatAction", { chat_id: telegramChatId(), action: "typing" }).catch(() => undefined);
  const role = await assistantRole(asker.staffId);
  const client = new Anthropic({ apiKey: vars().ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 }) as unknown as AssistantClient;
  let answer: AssistantAnswer;
  try { answer = await assistantTurn(question, { role, name: asker.name, previous }, client); }
  catch (error) {
    console.error("Telegram assistant failed", error instanceof Error ? error.message : error);
    await sendCard("Sorry, I couldn't answer just now. Please try again in a minute.", undefined, replyTo);
    return;
  }
  await recordSpend(answer.usd);
  for (const part of splitForTelegram(answer.text ?? "I couldn't find an answer to that.")) await sendCard(esc(part), undefined, replyTo);
}

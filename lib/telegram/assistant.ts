import { ensureReliabilityTables,reliabilityDb } from "./reliability-db";
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

// Haiku 5.5: the low-cost model (owner's choice). Prompts stay far under 100K tokens, so the base rate applies.
export const ASSISTANT_MODEL = "claude-haiku-5-5";
const PRICE = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }; // US$ per million tokens
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

export type AssistantUsage = { questions: number; usd: number };
async function spentThisMonth(): Promise<AssistantUsage> {
  await ensureReliabilityTables();
  const atomic=await reliabilityDb().prepare("SELECT spent_microusd,questions FROM telegram_assistant_budget WHERE month=?").bind(month()).first<{spent_microusd:number;questions:number}>();
  if (atomic) return {usd:atomic.spent_microusd/1e6,questions:atomic.questions};
  const row = await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(`tg_assistant_usage:${month()}`).first<{ value: string }>().catch(() => null);
  try { return { questions: 0, usd: 0, ...JSON.parse(row?.value ?? "{}") }; } catch { return { questions: 0, usd: 0 }; }
}

/** For Admin: this month's questions and estimated spend against the cap. */
export async function assistantUsage() {
  return { ...(await spentThisMonth()), capUsd: monthlyCapUsd(), configured: assistantConfigured(), model: ASSISTANT_MODEL };
}
async function recordSpend() {
  await ensureReliabilityTables();
  const at=new Date().toISOString();
  await reliabilityDb().batch([
    reliabilityDb().prepare("UPDATE telegram_assistant_budget SET questions=questions+1 WHERE month=?").bind(month()),
    reliabilityDb().prepare("INSERT INTO app_settings(key,value,updated_at) SELECT ?,json_object('questions',questions,'usd',spent_microusd/1000000.0),? FROM telegram_assistant_budget WHERE month=? ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(`tg_assistant_usage:${month()}`,at,month()),
  ]);
}

/** Reserve a conservative per-call estimate atomically. Unknown provider outcomes retain the reservation. */
export async function reserveAssistantCall(body:Record<string,unknown>) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),m=month(),id=crypto.randomUUID(),at=new Date().toISOString();
  const bytes=new TextEncoder().encode(JSON.stringify(body)).length;
  const amount=Math.ceil(bytes*Math.max(PRICE.input,PRICE.cacheWrite)+Number(body.max_tokens??4000)*PRICE.output);
  const cap=Math.floor(monthlyCapUsd()*1e6);
  const [reserved]=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_assistant_budget(month,spent_microusd,questions) SELECT ?,CAST(ROUND(COALESCE((SELECT json_extract(value,'$.usd') FROM app_settings WHERE key=?),0)*1000000) AS INTEGER),COALESCE((SELECT json_extract(value,'$.questions') FROM app_settings WHERE key=?),0)`).bind(m,`tg_assistant_usage:${m}`,`tg_assistant_usage:${m}`),
    db.prepare("INSERT INTO telegram_assistant_reservations(id,month,reserved_microusd,created_at) SELECT ?,?,?,? FROM telegram_assistant_budget WHERE month=? AND spent_microusd+reserved_microusd+?<=?").bind(id,m,amount,at,m,amount,cap),
    db.prepare("UPDATE telegram_assistant_budget SET reserved_microusd=reserved_microusd+? WHERE month=? AND EXISTS(SELECT 1 FROM telegram_assistant_reservations WHERE id=?)").bind(amount,m,id),
  ]).then(rows=>[rows[1]]);
  if (!reserved.meta.changes) throw new Error("ASSISTANT_BUDGET_REACHED");
  return {id,month:m,amount};
}
export async function settleAssistantCall(reservation:{id:string;month:string;amount:number},usage:Usage) {
  const db=reliabilityDb(),spent=Math.ceil(usd(usage)*1e6),claim=`settling:${crypto.randomUUID()}`;
  await db.batch([
    db.prepare("UPDATE telegram_assistant_reservations SET status=?,spent_microusd=? WHERE id=? AND status='reserved'").bind(claim,spent,reservation.id),
    db.prepare("UPDATE telegram_assistant_budget SET spent_microusd=spent_microusd+?,reserved_microusd=MAX(0,reserved_microusd-?) WHERE month=? AND EXISTS(SELECT 1 FROM telegram_assistant_reservations WHERE id=? AND status=?)").bind(spent,reservation.amount,reservation.month,reservation.id,claim),
    db.prepare("UPDATE telegram_assistant_reservations SET status='charged' WHERE id=? AND status=?").bind(reservation.id,claim),
  ]);
}

/** On when an API key exists, unless TELEGRAM_ASSISTANT=0. */
export const assistantConfigured = () => Boolean(vars().ANTHROPIC_API_KEY) && vars().TELEGRAM_ASSISTANT !== "0";

/** Waydidi has one admin: everyone on the Telegram team list asks with full (owner) access. */
export const TELEGRAM_TEAM_ROLE: StaffRole = "owner";

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
      // Haiku 5.5 has no server-side refusal fallback; a refusal is answered politely below.
      output_config: { effort: "medium" },
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
  if (!Number.isInteger(max) || max<2) throw new Error("Invalid Telegram message length");
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let end = remaining.lastIndexOf("\n", max);
    if (end < Math.floor(max/2)) end = max;
    // Do not split a UTF-16 surrogate pair.
    if (end === max && /[\uD800-\uDBFF]/.test(remaining[end-1])) end--;
    parts.push(remaining.slice(0,end));
    remaining = remaining.slice(end + (remaining[end] === "\n" ? 1 : 0));
  }
  if (remaining) parts.push(remaining);
  return parts;
}

/** Answers a team member's question in the group, under their message. */
export async function answerInGroup(question: string, replyTo: number, asker: { name: string }, previous: string | null) {
  const spent = await spentThisMonth();
  if (spent.usd >= monthlyCapUsd()) {
    await sendCard(`The assistant has reached this month's spending limit (US$${monthlyCapUsd()}). The owner can raise TELEGRAM_ASSISTANT_MONTHLY_USD in Cloudflare.`, undefined, replyTo);
    return;
  }
  await tg("sendChatAction", { chat_id: telegramChatId(), action: "typing" }).catch(() => undefined);
  const role = TELEGRAM_TEAM_ROLE;
  const provider=new Anthropic({apiKey:vars().ANTHROPIC_API_KEY,timeout:45000,maxRetries:0}) as unknown as AssistantClient;
  const client:AssistantClient={beta:{messages:{create:async body=>{
    const reservation=await reserveAssistantCall(body);
    const result=await provider.beta.messages.create(body);
    await settleAssistantCall(reservation,result.usage);
    return result;
  }}}};
  let answer: AssistantAnswer;
  try { answer = await assistantTurn(question, { role, name: asker.name, previous }, client); }
  catch (error) {
    console.error("Telegram assistant failed", error instanceof Error ? error.message : error);
    await recordSpend().catch(()=>undefined);
    await sendCard(error instanceof Error && error.message==="ASSISTANT_BUDGET_REACHED"?"The assistant has reached this month's spending limit. Try again after the owner reviews the budget.":"Sorry, I couldn't answer just now. Please try again in a minute.", undefined, replyTo);
    return;
  }
  await recordSpend();
  for (const part of splitForTelegram(answer.text ?? "I couldn't find an answer to that.")) await sendCard(esc(part), undefined, replyTo);
}

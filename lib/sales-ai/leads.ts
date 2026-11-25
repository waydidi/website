import { env } from "cloudflare:workers";
import { SITE_URL } from "@/lib/site";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { logActivity } from "./activity-log";
import { OPT_OUT, SIGNALS, SIGNAL_LABEL, leadScore, messageSignals, type Signal } from "./lead-rules";

// Lead scoring (F07, Sales Intelligence PR 5; on with SALES_AI_LEADS=1). Signals found in customer messages are
// recorded once per chat with the message as evidence; quote and booking signals are read from the database each
// time, so a score can always be rebuilt from what is stored. The owner is told once when a lead becomes hot.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
export const leadsEnabled = () => vars().SALES_AI_LEADS === "1";
/** Message signals are also needed by follow-ups (declined, opted out). */
const signalsNeeded = () => leadsEnabled() || vars().SALES_AI_FOLLOWUPS === "1";

// Same statements as drizzle/0131_sales_leads_followups.sql (Workers Builds does not apply D1 migrations).
export const LEAD_TABLES = [
  `CREATE TABLE IF NOT EXISTS ai_lead_signals(conversation_id TEXT NOT NULL,signal TEXT NOT NULL,evidence_message_id TEXT,created_at TEXT NOT NULL,PRIMARY KEY(conversation_id,signal))`,
  `CREATE TABLE IF NOT EXISTS ai_lead_scores(conversation_id TEXT PRIMARY KEY,score INTEGER NOT NULL,band TEXT NOT NULL,reasons_json TEXT NOT NULL,notified_band TEXT,last_customer_at TEXT,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_lead_scores_rank ON ai_lead_scores(score DESC,updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_followups(id TEXT PRIMARY KEY,bundle_id TEXT NOT NULL,conversation_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('customer','review')),seq INTEGER NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','running','sent','suppressed','cancelled','unknown')),reason TEXT,lease_until TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(bundle_id,kind,seq))`,
  `CREATE INDEX IF NOT EXISTS ai_followups_due ON ai_followups(status,due_at)`,
  `CREATE TABLE IF NOT EXISTS ai_loss_labels(bundle_id TEXT PRIMARY KEY,reason TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('staff')),labeled_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
];
let ready: Promise<unknown> | null = null;
export function ensureLeadTables() {
  ready ??= db().batch(LEAD_TABLES.map((sql) => db().prepare(sql))).catch((error) => { ready = null; throw error; });
  return ready;
}

/** Called for every new customer message (all channels). Records its signals once; never throws. */
export async function afterCustomerMessage(conversationId: string, messageId: string, body: string) {
  if (!signalsNeeded()) return;
  try {
    await ensureLeadTables();
    const found: string[] = [...messageSignals(body), ...(OPT_OUT.test(body) ? ["opted_out"] : [])];
    if (found.length) await db().batch(found.map((s) => db().prepare("INSERT INTO ai_lead_signals(conversation_id,signal,evidence_message_id,created_at) VALUES(?,?,?,?) ON CONFLICT(conversation_id,signal) DO NOTHING")
      .bind(conversationId, s, messageId, new Date().toISOString())));
    if (leadsEnabled()) await rescore(conversationId);
  } catch (error) { console.error("lead signals failed", error instanceof Error ? error.message : "unknown"); }
}

export type LeadView = { conversationId: string; publicId: string | null; channel: string | null; score: number; band: string; reasons: string[]; evidence: Record<string, string | null>; lastCustomerAt: string | null };

/** The score as it stands now (decay included), from stored and derived signals. */
export async function currentLead(conversationId: string, now = Date.now()): Promise<LeadView | null> {
  await ensureLeadTables();
  const c = await db().prepare("SELECT id,public_id,channel,channel_user_id,created_at FROM website_conversations WHERE id=?").bind(conversationId).first<{ id: string; public_id: string | null; channel: string | null; channel_user_id: string | null; created_at: string }>();
  if (!c) return null;
  const evidence: Record<string, string | null> = {};
  for (const r of (await db().prepare("SELECT signal,evidence_message_id FROM ai_lead_signals WHERE conversation_id=?").bind(conversationId).all<{ signal: string; evidence_message_id: string | null }>()).results)
    if (r.signal in SIGNALS) evidence[r.signal] = r.evidence_message_id;
  // Derived from quote drafts the assistant made for this chat (any revision).
  const draft = await db().prepare("SELECT id,trip_date,pickup,dropoff,passengers FROM ai_quote_drafts WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1").bind(conversationId).first<{ id: string; trip_date: string; pickup: string; dropoff: string; passengers: number }>().catch(() => null);
  if (draft) {
    evidence.quote_request ??= `draft:${draft.id}`;
    if (draft.trip_date) evidence.specific_date ??= `draft:${draft.id}`;
    if (draft.pickup && draft.dropoff) evidence.route ??= `draft:${draft.id}`;
    if (draft.passengers > 0) evidence.group_details ??= `draft:${draft.id}`;
  }
  const accepted = await db().prepare("SELECT q.id FROM ai_quote_drafts d JOIN crm_quotes q ON q.id=d.crm_quote_id WHERE d.conversation_id=? AND q.status IN ('accepted','converted') LIMIT 1").bind(conversationId).first<{ id: string }>().catch(() => null);
  if (accepted) evidence.booking_link_request ??= `quote:${accepted.id}`;
  // Returning: an earlier chat from the same WhatsApp/LINE account, or a booking on the CRM contact.
  const earlier = c.channel_user_id ? await db().prepare("SELECT id FROM website_conversations WHERE channel=? AND channel_user_id=? AND created_at<? LIMIT 1").bind(c.channel, c.channel_user_id, c.created_at).first<{ id: string }>() : null;
  const booked = await db().prepare("SELECT b.source_id FROM crm_sources s JOIN crm_sources b ON b.contact_id=s.contact_id AND b.kind='booking' WHERE s.kind='chat' AND s.source_id=? LIMIT 1").bind(conversationId).first<{ source_id: string }>().catch(() => null);
  if (earlier || booked) evidence.returning_customer ??= earlier ? `chat:${earlier.id}` : `booking:${booked!.source_id}`;
  const last = await db().prepare("SELECT MAX(created_at) at FROM website_chat_messages WHERE conversation_id=? AND sender='visitor'").bind(conversationId).first<{ at: string | null }>();
  const s = leadScore(Object.keys(evidence) as Signal[], last?.at ?? null, now);
  return { conversationId, publicId: c.public_id, channel: c.channel, score: s.score, band: s.band, reasons: s.reasons, evidence, lastCustomerAt: last?.at ?? null };
}

/** Stores the score and tells the owner once when the lead becomes hot. */
export async function rescore(conversationId: string) {
  if (!leadsEnabled()) return null;
  await ensureLeadTables();
  const lead = await currentLead(conversationId);
  if (!lead) return null;
  const stamp = new Date().toISOString();
  // Dropping below warm re-arms the alert; reaching hot claims it in one guarded statement, so it is sent once.
  await db().prepare(`INSERT INTO ai_lead_scores(conversation_id,score,band,reasons_json,notified_band,last_customer_at,updated_at) VALUES(?,?,?,?,NULL,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET score=excluded.score,band=excluded.band,reasons_json=excluded.reasons_json,last_customer_at=excluded.last_customer_at,updated_at=excluded.updated_at,
    notified_band=CASE WHEN excluded.band IN ('cold','interested') THEN NULL ELSE ai_lead_scores.notified_band END`)
    .bind(conversationId, lead.score, lead.band, JSON.stringify(lead.reasons), lead.lastCustomerAt, stamp).run();
  const claimed = lead.band === "hot"
    ? (await db().prepare("UPDATE ai_lead_scores SET notified_band='hot' WHERE conversation_id=? AND notified_band IS NOT 'hot'").bind(conversationId).run()).meta.changes > 0 : false;
  if (claimed && telegramConfigured()) {
    const reasons = lead.reasons.filter((r) => r in SIGNALS).map((r) => SIGNAL_LABEL[r as Signal]).join(", ");
    await sendCard(`<b>🔥 Hot lead</b> · ${lead.publicId ?? conversationId.slice(0, 8)} · ${lead.channel ?? "web"}\nScore ${lead.score}/100: ${reasons}.\nA heuristic to help you prioritise, not a prediction.`,
      [[{ text: "Open leads", url: `${SITE_URL}/admin/sales-insights` }]]).catch(() => undefined);
    await logActivity({ event: "lead_hot", status: "ok", actor: "system", channel: lead.channel, conversationId, summary: `Lead became hot (${lead.score}/100); owner notified once`, detail: { score: lead.score, reasons: lead.reasons } });
  }
  return lead;
}

/** Owner page: leads by stored score, re-scored live so decay is current. */
export async function listLeads(limit = 100) {
  await ensureLeadTables();
  const rows = (await db().prepare("SELECT conversation_id FROM ai_lead_scores ORDER BY score DESC,updated_at DESC LIMIT ?").bind(Math.min(Math.max(limit, 1), 200)).all<{ conversation_id: string }>()).results;
  const leads: LeadView[] = [];
  for (const r of rows) { const l = await currentLead(r.conversation_id); if (l) leads.push(l); }
  return leads.sort((a, b) => b.score - a.score);
}

export async function conversationSignals(conversationId: string) {
  await ensureLeadTables();
  return new Set((await db().prepare("SELECT signal FROM ai_lead_signals WHERE conversation_id=?").bind(conversationId).all<{ signal: string }>()).results.map((r) => r.signal));
}

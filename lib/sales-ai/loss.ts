import { env } from "cloudflare:workers";
import type { TelegramUser } from "@/lib/telegram/client";
import { logActivity } from "./activity-log";
import { ensureLeadTables } from "./leads";
import { LOSS_LABEL, LOSS_REASONS, inferLossReason, latencyBucket, quoteOutcome, sizeBucket, summarize, type LossReason, type QuoteOutcome } from "./lead-rules";
import { ensureQuoteTables, ownerActor } from "./quote-drafts";

// Lost-quote analysis (F12, Sales Intelligence PR 5): on demand only, for the owner. Each sent quote (a bundle of
// one or more trips, after its last revision) is counted once. Reasons are the owner's label, else a reason the
// customer's own words suggest (with the message as evidence), else "unknown". Recommendations are for people:
// nothing here changes a price or contacts a customer. There is no scheduled or daily report.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

export async function setLossLabel(bundleId: string, reason: string, by: { name: string; staffId: string }) {
  if (!(LOSS_REASONS as readonly string[]).includes(reason)) throw new Error("Unknown reason.");
  await ensureLeadTables(); await ensureQuoteTables();
  const legs = await db().prepare("SELECT conversation_id,status FROM ai_quote_drafts WHERE bundle_id=? AND leg_no=1").bind(bundleId).first<{ conversation_id: string; status: string }>();
  if (!legs || legs.status !== "sent") throw new Error("Only sent quotes can be labelled.");
  const stamp = new Date().toISOString();
  await db().prepare("INSERT INTO ai_loss_labels(bundle_id,reason,source,labeled_by,created_at,updated_at) VALUES(?,?,'staff',?,?,?) ON CONFLICT(bundle_id) DO UPDATE SET reason=excluded.reason,labeled_by=excluded.labeled_by,updated_at=excluded.updated_at")
    .bind(bundleId, reason, by.name, stamp, stamp).run();
  // Corrections stay visible: every label is also an activity-log entry.
  await logActivity({ event: "loss_labeled", status: "ok", actor: `owner:${by.staffId}`, conversationId: legs.conversation_id, correlationId: bundleId, summary: `Quote ${bundleId} labelled: ${LOSS_LABEL[reason as LossReason]}` });
}

/** "sl:<bundle>:<reason index>" buttons on the 7-day review card (owner only). */
export async function handleLossCallback(data: string, from: TelegramUser) {
  const m = /^sl:([a-f0-9]{16}):(\d)$/.exec(data);
  const reason = m ? LOSS_REASONS[Number(m[2])] : undefined;
  if (!m || !reason) return { text: "Unknown action." };
  const owner = await ownerActor(from);
  if (!owner) return { text: "Only the owner can label quotes.", alert: true };
  try { await setLossLabel(m[1], reason, { name: owner.name, staffId: owner.staff_id }); return { text: `Saved: ${LOSS_LABEL[reason]}.` }; }
  catch (e) { return { text: e instanceof Error ? e.message : "Not saved.", alert: true }; }
}

export type QuoteFact = {
  bundleId: string; conversationId: string; channel: string; sentAt: string; trips: number; totalThb: number; route: string; vehicle: string;
  latencyMinutes: number | null; outcome: QuoteOutcome; reason: LossReason | null; reasonSource: "staff" | "inferred" | null; evidence: string | null; edited: boolean;
};

/** Sent quotes in [from, to) by sent time, one row per bundle. */
export async function quoteFacts(from: string, to: string, now = Date.now()): Promise<QuoteFact[]> {
  await ensureLeadTables(); await ensureQuoteTables();
  const legs = (await db().prepare(`SELECT d.bundle_id,d.leg_no,d.conversation_id,d.channel,d.decided_at,d.quote_expires_at,d.price_thb,d.dropoff,d.options_json,d.selected,d.edited_by,d.visitor_seq,q.status quote_status,q.booking_reference
    FROM ai_quote_drafts d LEFT JOIN crm_quotes q ON q.id=d.crm_quote_id WHERE d.status='sent' AND d.decided_at>=? AND d.decided_at<? ORDER BY d.decided_at,d.bundle_id,d.leg_no LIMIT 5000`).bind(from, to)
    .all<{ bundle_id: string; leg_no: number; conversation_id: string; channel: string; decided_at: string; quote_expires_at: string | null; price_thb: number; dropoff: string; options_json: string; selected: number; edited_by: string | null; visitor_seq: number; quote_status: string | null; booking_reference: string | null }>()).results;
  const bundles = new Map<string, typeof legs>();
  for (const l of legs) bundles.set(l.bundle_id, [...(bundles.get(l.bundle_id) ?? []), l]);
  const facts: QuoteFact[] = [];
  for (const [bundleId, ls] of bundles) {
    const first = ls[0];
    const label = await db().prepare("SELECT reason FROM ai_loss_labels WHERE bundle_id=?").bind(bundleId).first<{ reason: LossReason }>();
    const declined = await db().prepare("SELECT 1 x FROM ai_lead_signals WHERE conversation_id=? AND signal='declined' AND created_at>=?").bind(first.conversation_id, first.decided_at).first();
    const after = (await db().prepare("SELECT id,body FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' AND created_at>=? ORDER BY rowid LIMIT 50").bind(first.conversation_id, first.decided_at).all<{ id: string; body: string }>()).results;
    const asked = await db().prepare("SELECT created_at FROM website_chat_messages WHERE rowid=?").bind(first.visitor_seq).first<{ created_at: string }>();
    const outcome = quoteOutcome({ anyConverted: ls.some((l) => l.quote_status === "converted" || l.booking_reference), anyAccepted: ls.some((l) => l.quote_status === "accepted"),
      declined: Boolean(declined), staffLabel: label?.reason ?? null, sentAt: first.decided_at, validUntil: ls.map((l) => l.quote_expires_at).filter(Boolean).sort().at(-1) ?? null }, now);
    const inferred = !label && (outcome === "declined" || outcome === "no_decision") ? inferLossReason(after) : null;
    let vehicle = "unknown";
    try { vehicle = JSON.parse(first.options_json)[first.selected]?.name ?? "unknown"; } catch { /* keep unknown */ }
    facts.push({
      bundleId, conversationId: first.conversation_id, channel: first.channel, sentAt: first.decided_at, trips: ls.length, totalThb: ls.reduce((n, l) => n + (l.price_thb ?? 0), 0),
      route: ls.length > 1 ? "Several trips" : first.dropoff.trim().slice(0, 40), vehicle: ls.length > 1 ? "Several trips" : vehicle,
      latencyMinutes: asked ? Math.max(0, Math.round((Date.parse(first.decided_at) - Date.parse(asked.created_at)) / 60000)) : null,
      outcome, reason: label?.reason ?? inferred?.reason ?? (outcome === "declined" || outcome === "no_decision" ? "unknown" : null),
      reasonSource: label ? "staff" : inferred ? "inferred" : null, evidence: inferred?.evidence ?? null, edited: ls.some((l) => l.edited_by),
    });
  }
  return facts;
}

/** The owner's on-demand analysis: totals, breakdowns with sample sizes, and reasons for lost quotes. */
export async function lossAnalysis(from: string, to: string, now = Date.now()) {
  const facts = await quoteFacts(from, to, now);
  const by = (key: (f: QuoteFact) => string) => summarize(facts.map((f) => ({ group: key(f), outcome: f.outcome, totalThb: f.totalThb })));
  const reasons = new Map<string, { reason: string; staff: number; inferred: number; unknown: number }>();
  for (const f of facts.filter((x) => x.reason)) {
    const r = reasons.get(f.reason!) ?? { reason: f.reason!, staff: 0, inferred: 0, unknown: 0 };
    if (f.reasonSource === "staff") r.staff++; else if (f.reasonSource === "inferred") r.inferred++; else r.unknown++;
    reasons.set(f.reason!, r);
  }
  const lost = facts.filter((f) => f.outcome === "declined" || f.outcome === "no_decision");
  return {
    from, to, total: summarize(facts.map((f) => ({ group: "All quotes", outcome: f.outcome, totalThb: f.totalThb })))[0] ?? null,
    byChannel: by((f) => f.channel), byRoute: by((f) => f.route), byVehicle: by((f) => f.vehicle), bySize: by((f) => sizeBucket(f.totalThb)), byLatency: by((f) => latencyBucket(f.latencyMinutes)),
    byWeek: by((f) => isoWeek(f.sentAt)), reasons: [...reasons.values()],
    // Face value of quotes not won, kept apart from money actually won (converted quotes).
    notWonThb: lost.reduce((n, f) => n + f.totalThb, 0), wonThb: facts.filter((f) => f.outcome === "converted").reduce((n, f) => n + f.totalThb, 0),
    quotes: facts.slice(-200).reverse(),
  };
}

const isoWeek = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600_000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return `Week of ${d.toISOString().slice(0, 10)}`; };

const cell = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`; };
/** CSV export (no customer contact details: quote ids, chat ids, routes and amounts only). */
export function factsCsv(facts: QuoteFact[]) {
  return [["Quote", "Chat", "Channel", "Sent (UTC)", "Trips", "Total THB", "Route", "Car", "Minutes to quote", "Outcome", "Reason", "Reason source", "Evidence message", "Price edited"],
    ...facts.map((f) => [f.bundleId, f.conversationId, f.channel, f.sentAt, f.trips, f.totalThb, f.route, f.vehicle, f.latencyMinutes ?? "", f.outcome, f.reason ?? "", f.reasonSource ?? "", f.evidence ?? "", f.edited ? "yes" : "no"])]
    .map((r) => r.map(cell).join(",")).join("\r\n");
}

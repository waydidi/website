import { env } from "cloudflare:workers";
import { deliverWhatsAppTemplate, whatsappConfigured } from "@/lib/channels";
import { crmDb } from "@/lib/crm";
import { translate, getMessages } from "@/lib/i18n";
import { ASSISTANT_NAME } from "@/lib/cee/name";
import { ensureFoundationTables, logActivity } from "./activity-log";
import { followupTemplate, quoteFollowupStep, FOLLOWUP_INTERVAL_MS, STOP_REMINDER_SQL } from "./followup-rules";
import { ensureQuoteTables } from "./quote-drafts";
import { customerLocale } from "./quote-rules";
import { disabledChannels } from "./whatsapp-rules";

type Candidate = {
  quote_id: string;
  draft_id: string;
  conversation_id: string;
  recipient: string;
  sent_at: string;
  inbound_body: string;
};

const settings = () => env as unknown as Record<string, string | undefined>;

// The same eligibility predicate is used at selection, atomic reservation and immediately before sending.
const eligibleQuote = `
  FROM ai_quote_drafts d
  JOIN crm_quotes q ON q.id=d.crm_quote_id
  JOIN website_conversations c ON c.id=d.conversation_id
  JOIN crm_sources source ON source.kind='chat' AND source.source_id=c.id AND source.contact_id=q.contact_id
  JOIN website_chat_messages v ON v.rowid=d.visitor_seq AND v.conversation_id=c.id AND v.sender='visitor'
  JOIN ai_activity_log a ON a.correlation_id=d.id AND a.event='quote_sent' AND a.status='ok'
  JOIN crm_events consent ON consent.rowid=(
    SELECT e.rowid FROM crm_events e
    WHERE e.contact_id=q.contact_id AND e.entity_id=c.id AND e.kind='whatsapp_quote_followup_consent'
    ORDER BY e.rowid DESC LIMIT 1
  ) AND consent.body='Opted in'
  WHERE q.status='sent' AND q.version=1 AND q.token_hash IS NOT NULL AND q.expires_at>? AND d.quote_expires_at>? AND q.updated_at<=d.updated_at
    AND d.status='sent' AND d.channel='whatsapp' AND c.channel='whatsapp' AND c.status='open' AND c.expires_at>?
    AND c.channel_user_id IS NOT NULL AND c.assigned_name IS NULL AND c.assigned_staff_id IS NULL
    AND c.assigned_telegram_user_id IS NULL AND coalesce(c.bot_paused,0)=0
    AND v.created_at<=?
    AND EXISTS (
      SELECT 1 FROM website_chat_messages m WHERE m.conversation_id=c.id AND m.is_bot=1
        AND m.created_at>=d.decided_at AND m.created_at<=d.updated_at
        AND instr(m.body,'/quote/')>0 AND m.channel_message_id LIKE 'wamid.%'
        AND NOT EXISTS (SELECT 1 FROM channel_delivery_status s WHERE s.channel_message_id=m.channel_message_id AND s.status='failed')
    )
    AND NOT EXISTS (
      SELECT 1 FROM website_chat_messages m WHERE m.conversation_id=c.id AND m.sender='visitor'
        AND m.created_at>=consent.created_at AND ${STOP_REMINDER_SQL}
    )
    AND NOT EXISTS (SELECT 1 FROM crm_leads l WHERE l.id=q.lead_id AND l.stage IN ('awaiting_payment','won','lost','cancelled'))
    AND NOT EXISTS (SELECT 1 FROM ai_quote_drafts n WHERE n.conversation_id=c.id AND n.rowid>d.rowid)
    AND NOT EXISTS (
      SELECT 1 FROM website_chat_messages m WHERE m.conversation_id=c.id
        AND ((m.sender='visitor' AND m.rowid>v.rowid) OR (m.sender='staff' AND coalesce(m.is_bot,0)=0 AND m.created_at>=a.created_at))
    )
`;

export async function runQuoteFollowups(at = new Date()) {
  const vars = settings();
  const templateName = vars.SALES_AI_FOLLOWUP_TEMPLATE;
  if (vars.SALES_AI_FOLLOWUPS !== "1" || disabledChannels(vars.ASSISTANT_DISABLED_CHANNELS).has("whatsapp")
    || !followupTemplate(templateName, "en") || !whatsappConfigured()) return 0;

  await Promise.all([ensureQuoteTables(), ensureFoundationTables()]);
  const db = crmDb();
  const hasMultiLegQuotes = await db.prepare("SELECT 1 present FROM sqlite_schema WHERE type='table' AND name='ai_quote_legs'").first();
  const eligible = eligibleQuote + (hasMultiLegQuotes ? `
    AND NOT EXISTS (
      SELECT 1 FROM ai_quote_legs leg LEFT JOIN crm_quotes sibling ON sibling.id=leg.crm_quote_id
      WHERE leg.draft_id=d.id AND (sibling.id IS NULL OR sibling.status<>'sent'
        OR sibling.version<>leg.crm_version OR sibling.updated_at>d.updated_at)
    )
  ` : "");
  const bounds = (now: number) => [
    new Date(now).toISOString(), new Date(now).toISOString(),
    new Date(now).toISOString(), new Date(now).toISOString(),
  ];
  // The step is part of the message ID, so parallel cron runs and interrupted sends cannot repeat it.
  const stepSql = "CASE WHEN a.created_at<=? THEN 2 ELSE 1 END";
  const previousStepAccepted = `
    AND (a.created_at>? OR EXISTS (
      SELECT 1 FROM website_chat_messages m
      WHERE m.id='quote-followup:'||q.id||':1' AND m.created_at<=?
        AND m.channel_message_id LIKE 'wamid.%'
        AND NOT EXISTS (SELECT 1 FROM channel_delivery_status s WHERE s.channel_message_id=m.channel_message_id AND s.status='failed')
    ))
  `;
  const eligibleStep = `
    AND a.created_at>? AND a.created_at<=?
    AND NOT EXISTS (SELECT 1 FROM website_chat_messages m WHERE m.id='quote-followup:'||q.id||':'||(${stepSql}))
    ${previousStepAccepted}
  `;
  const now = at.getTime();
  const firstDue = new Date(now - FOLLOWUP_INTERVAL_MS).toISOString();
  const secondDue = new Date(now - 2 * FOLLOWUP_INTERVAL_MS).toISOString();
  const oldest = new Date(now - 3 * FOLLOWUP_INTERVAL_MS).toISOString();
  const { results } = await db.prepare(`
    SELECT q.id quote_id,d.id draft_id,c.id conversation_id,c.channel_user_id recipient,
      a.created_at sent_at,v.body inbound_body
    ${eligible} ${eligibleStep}
    ORDER BY a.created_at LIMIT 10
  `).bind(...bounds(now), oldest, firstDue, secondDue, secondDue, firstDue).all<Candidate>();

  let sent = 0;
  for (const row of results) {
    const step = quoteFollowupStep(row.sent_at, now);
    const locale = customerLocale(row.inbound_body);
    const template = followupTemplate(templateName, locale);
    if (!step || !template) continue;
    const id = `quote-followup:${row.quote_id}:${step}`;
    const body = translate(getMessages(locale), "salesQuote.followup");
    const checkAt = Date.now();
    const stamp = new Date(checkAt).toISOString();
    const claim = await db.prepare(`
      INSERT OR IGNORE INTO website_chat_messages(id,conversation_id,sender,body,created_at,sender_name,is_bot,telegram_status,channel_message_id)
      SELECT ?,c.id,'staff',?,?,?,1,'skipped','sending'
      ${eligible} ${eligibleStep} AND q.id=? AND d.id=?
    `).bind(id, body, stamp, ASSISTANT_NAME, ...bounds(checkAt), oldest, firstDue, secondDue, secondDue, firstDue, row.quote_id, row.draft_id).run();
    if (!claim.meta.changes) continue;

    // Every send uses the approved template, including when the 24-hour reply window has closed.
    let providerId = "suppressed";
    const freshAt = Date.now();
    const active = await db.prepare(`SELECT 1 ok ${eligible} ${previousStepAccepted} AND q.id=? AND d.id=? AND c.channel_user_id=?`)
      .bind(...bounds(freshAt), secondDue, firstDue, row.quote_id, row.draft_id, row.recipient).first();
    if (active) {
      try {
        providerId = await deliverWhatsAppTemplate(row.recipient, template) ?? "failed";
      } catch {
        // A timeout can follow provider acceptance. Keep the reservation and never retry it.
        providerId = "failed";
      }
    }
    const outcome = providerId === "suppressed" ? "suppressed" : providerId.startsWith("wamid.") ? "ok" : "error";
    await db.batch([
      db.prepare("UPDATE website_chat_messages SET channel_message_id=? WHERE id=?").bind(providerId, id),
      ...(outcome === "ok" ? [
        db.prepare(`UPDATE website_conversations
          SET updated_at=max(updated_at,?),last_message_at=max(coalesce(last_message_at,?),?),idle_nudge_msg_id=?
          WHERE id=? AND ?=(SELECT id FROM website_chat_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 1)`)
          .bind(stamp, stamp, stamp, id, row.conversation_id, id, row.conversation_id),
      ] : []),
    ]);
    await logActivity({
      event: "quote_followup", status: outcome, actor: "system", channel: "whatsapp",
      conversationId: row.conversation_id, correlationId: row.draft_id, dedupeKey: id,
      summary: `Quote reminder ${step}: ${outcome === "ok" ? "accepted by WhatsApp" : outcome === "suppressed" ? "eligibility changed before dispatch" : "delivery unconfirmed"}`,
    });
    if (outcome === "ok") sent++;
  }
  return sent;
}

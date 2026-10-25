import type { SecurityDatabase } from "./worker-db";

export type InboxItem = {
  id: string;
  kind: "alert" | "journey" | "delivery";
  reference: string;
  severity: string;
  title: string;
  occurredAt: string;
  status: string;
  acknowledgedBy: string | null;
};

export type InboxKind = "all" | InboxItem["kind"];
export const INBOX_PAGE_SIZE = 100;

export function parseInboxQuery(url: URL): { kind: InboxKind; offset: number } | null {
  const kind = url.searchParams.get("kind") ?? "all";
  const rawOffset = url.searchParams.get("offset") ?? "0";
  if (!["all", "alert", "journey", "delivery"].includes(kind) || !/^\d{1,9}$/.test(rawOffset)) return null;
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset % INBOX_PAGE_SIZE !== 0) return null;
  return { kind: kind as InboxKind, offset };
}

export function canReadOperationsInbox(role: string) {
  return role === "owner" || role === "operations";
}

/** Read existing operational records without exposing recipients, GPS or payment data. */
export async function operationsInbox(db: SecurityDatabase, query = { kind: "all" as InboxKind, offset: 0 }) {
  const { results } = await db.prepare(`
    SELECT * FROM (
      SELECT 'alert:' || id AS id, 'alert' AS kind, booking_reference AS reference,
        severity, title, detected_at AS occurredAt, status, acknowledged_by AS acknowledgedBy
      FROM operations_alerts WHERE status IN ('open', 'acknowledged')
      UNION ALL
      SELECT 'journey:' || e.id, 'journey', e.booking_reference, e.severity,
        CASE WHEN e.exception_type = 'abnormal_stop' THEN 'Prolonged stop needs review'
          ELSE 'Journey exception needs review' END, e.updated_at, e.status, NULL
      FROM journey_exceptions e
      JOIN booking_assignments a ON a.id = e.assignment_id
      WHERE e.status = 'open' AND a.revoked_at IS NULL
      UNION ALL
      SELECT 'delivery:' || id, 'delivery', booking_reference, 'warning',
        'Booking notification failed', updated_at, status, NULL
      FROM booking_notifications WHERE status = 'failed'
      UNION ALL
      SELECT 'delivery_job:' || id, 'delivery', booking_reference,
        CASE WHEN status IN ('uncertain','dead_letter') THEN 'critical' ELSE 'warning' END,
        CASE WHEN status = 'uncertain' THEN 'Email outcome needs review before resending'
          WHEN status = 'dead_letter' THEN 'Booking delivery stopped after failure'
          WHEN status = 'pending_configuration' THEN 'Booking delivery configuration is missing'
          ELSE 'Booking delivery will retry' END,
        updated_at, status, NULL
      FROM booking_deliveries WHERE status IN ('failed','uncertain','dead_letter','pending_configuration')
    )
    WHERE (? = 'all' OR kind = ?)
    ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, occurredAt DESC, id
    LIMIT 101 OFFSET ?
  `).bind(query.kind, query.kind, query.offset).all<InboxItem>();
  return { items: results.slice(0, INBOX_PAGE_SIZE), hasMore: results.length > INBOX_PAGE_SIZE, offset: query.offset };
}

/** One guarded write prevents a stale acknowledgment from reopening a resolved alert. */
export async function updateInboxAlert(db: SecurityDatabase, input: {
  id: string; action: "acknowledge" | "resolve"; expectedStatus: "open" | "acknowledged";
  actor: string; note: string;
}) {
  const now = new Date().toISOString();
  if (input.action === "acknowledge") {
    if (input.expectedStatus !== "open") return false;
    const result = await db.prepare("UPDATE operations_alerts SET status='acknowledged',acknowledged_at=?,acknowledged_by=?,updated_at=? WHERE id=? AND status='open'")
      .bind(now, input.actor, now, input.id).run();
    return result.meta.changes === 1;
  }
  const result = await db.prepare("UPDATE operations_alerts SET status='resolved',resolved_at=?,resolution_note=?,updated_at=? WHERE id=? AND status=?")
    .bind(now, `${input.actor}: ${input.note}`, now, input.id, input.expectedStatus).run();
  return result.meta.changes === 1;
}

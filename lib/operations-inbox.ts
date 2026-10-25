import type { SecurityDatabase } from "./worker-db";

export type InboxItem = {
  id: string;
  kind: "alert" | "journey" | "delivery";
  reference: string;
  severity: string;
  title: string;
  occurredAt: string;
};

export function canReadOperationsInbox(role: string) {
  return role === "owner" || role === "operations";
}

/** Read existing operational records without exposing recipients, GPS or payment data. */
export async function operationsInbox(db: SecurityDatabase) {
  const { results } = await db.prepare(`
    SELECT * FROM (
      SELECT 'alert:' || id AS id, 'alert' AS kind, booking_reference AS reference,
        severity, title, detected_at AS occurredAt
      FROM operations_alerts WHERE status IN ('open', 'acknowledged')
      UNION ALL
      SELECT 'journey:' || e.id, 'journey', e.booking_reference, e.severity,
        CASE WHEN e.exception_type = 'abnormal_stop' THEN 'Prolonged stop needs review'
          ELSE 'Journey exception needs review' END, e.updated_at
      FROM journey_exceptions e
      JOIN booking_assignments a ON a.id = e.assignment_id
      WHERE e.status = 'open' AND a.revoked_at IS NULL
      UNION ALL
      SELECT 'delivery:' || id, 'delivery', booking_reference, 'warning',
        'Booking notification failed', updated_at
      FROM booking_notifications WHERE status = 'failed'
    )
    ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, occurredAt DESC, id
    LIMIT 101
  `).all<InboxItem>();
  return { items: results.slice(0, 100), hasMore: results.length > 100 };
}

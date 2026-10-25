import type { SecurityDatabase } from "./worker-db";
import { sha256 } from "./security";
import type { PaymentDiscrepancy } from "./payment-discrepancies";

// Workers Builds does not apply migrations. Keep this bootstrap aligned with 0109.
export async function ensurePaymentReviews(db: SecurityDatabase) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS payment_review_state (booking_reference TEXT PRIMARY KEY REFERENCES bookings(reference),owner_id TEXT,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),version INTEGER NOT NULL DEFAULT 0,last_event_id TEXT,updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payment_review_events (id TEXT PRIMARY KEY,booking_reference TEXT NOT NULL REFERENCES bookings(reference),actor_id TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN ('claim','release','note','resolve')),note TEXT NOT NULL,version INTEGER NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(booking_reference,version))"),
    db.prepare("CREATE INDEX IF NOT EXISTS payment_review_events_booking ON payment_review_events(booking_reference,created_at)"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS payment_review_events_no_update BEFORE UPDATE ON payment_review_events BEGIN SELECT RAISE(ABORT,'Payment review history is append-only'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS payment_review_events_no_delete BEFORE DELETE ON payment_review_events BEGIN SELECT RAISE(ABORT,'Payment review history is append-only'); END"),
    db.prepare("CREATE TABLE IF NOT EXISTS payment_review_observations (id TEXT PRIMARY KEY,booking_reference TEXT NOT NULL REFERENCES bookings(reference),reason_codes_json TEXT NOT NULL,expected_minor INTEGER NOT NULL,provider_amount_minor INTEGER,provider_currency TEXT,created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS payment_review_observations_booking ON payment_review_observations(booking_reference,created_at)"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS payment_review_observations_no_update BEFORE UPDATE ON payment_review_observations BEGIN SELECT RAISE(ABORT,'Payment observations are append-only'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS payment_review_observations_no_delete BEFORE DELETE ON payment_review_observations BEGIN SELECT RAISE(ABORT,'Payment observations are append-only'); END"),
  ]);
}

export async function recordPaymentObservation(db: SecurityDatabase, reference: string, reasons: PaymentDiscrepancy[], expectedMinor: number, providerMinor: number | undefined, currency: string | undefined) {
  await ensurePaymentReviews(db);
  await db.prepare("INSERT INTO payment_review_observations(id,booking_reference,reason_codes_json,expected_minor,provider_amount_minor,provider_currency,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), reference, JSON.stringify(reasons), expectedMinor, Number.isSafeInteger(providerMinor) ? providerMinor! : null, currency && /^[a-z]{3}$/.test(currency) ? currency : null, new Date().toISOString()).run();
}

export type PaymentReviewRow = {
  reference: string; reconciliationStatus: string; paymentStatus: string; bookingStatus: string;
  method: string; sessionMissing: number;
  expectedMinor: number; receivedMinor: number; lastCheckedAt: string | null;
  ownerId: string | null; ownerName: string | null; reviewStatus: string; version: number;
  reasonsJson: string | null; providerMinor: number | null; providerCurrency: string | null;
};

export async function paymentReviewCases(db: SecurityDatabase, offset: number, status: "open" | "resolved" | "all" = "open") {
  await ensurePaymentReviews(db);
  const { results } = await db.prepare(`SELECT * FROM (SELECT b.reference,b.created_at AS createdAt,b.reconciliation_status AS reconciliationStatus,b.payment_status AS paymentStatus,
    b.status AS bookingStatus,b.payment_method AS method,CASE WHEN b.checkout_session_id IS NULL THEN 1 ELSE 0 END AS sessionMissing,
    CAST(round(b.total*100) AS INTEGER) AS expectedMinor,COALESCE(p.amount_paid_minor,CAST(round(b.amount_paid*100) AS INTEGER)) AS receivedMinor,b.last_payment_checked_at AS lastCheckedAt,
    r.owner_id AS ownerId,a.display_name AS ownerName,
    CASE WHEN b.reconciliation_status='mismatch' OR b.payment_status='disputed'
      OR (b.payment_method='stripe' AND (b.checkout_session_id IS NULL OR b.payment_status IN ('failed','processing','pending')))
      THEN 'open' ELSE COALESCE(r.status,'open') END AS reviewStatus,COALESCE(r.version,0) AS version,
    o.reason_codes_json AS reasonsJson,o.provider_amount_minor AS providerMinor,o.provider_currency AS providerCurrency
    FROM bookings b LEFT JOIN payment_review_state r ON r.booking_reference=b.reference
    LEFT JOIN booking_payments p ON p.id='primary:' || b.reference
    LEFT JOIN staff_accounts a ON a.id=r.owner_id
    LEFT JOIN payment_review_observations o ON o.id=(SELECT id FROM payment_review_observations WHERE booking_reference=b.reference ORDER BY created_at DESC,rowid DESC LIMIT 1)
    WHERE b.status!='binned' AND (b.reconciliation_status='mismatch' OR b.payment_status='disputed'
      OR (b.payment_method='stripe' AND (b.checkout_session_id IS NULL OR b.payment_status IN ('failed','processing','pending')))
      OR r.booking_reference IS NOT NULL))
    WHERE (?='all' OR reviewStatus=?)
    ORDER BY CASE WHEN reconciliationStatus='mismatch' OR paymentStatus='disputed' THEN 0 ELSE 1 END,createdAt DESC,reference
    LIMIT 51 OFFSET ?`).bind(status, status, offset).all<PaymentReviewRow>();
  return { items: results.slice(0, 50), hasMore: results.length > 50, offset };
}

export async function paymentReviewHistory(db: SecurityDatabase, reference: string, offset = 0) {
  await ensurePaymentReviews(db);
  return (await db.prepare("SELECT e.id,e.action,e.note,e.version,e.created_at AS createdAt,a.display_name AS actorName FROM payment_review_events e LEFT JOIN staff_accounts a ON a.id=e.actor_id WHERE e.booking_reference=? ORDER BY e.version DESC LIMIT 101 OFFSET ?").bind(reference, offset).all()).results;
}

export type ReviewAction = { requestId: string; reference: string; action: "claim" | "release" | "note" | "resolve"; expectedVersion: number; note: string };
export async function actOnPaymentReview(db: SecurityDatabase, input: ReviewAction, actorId: string): Promise<"saved" | "duplicate" | "conflict" | "not_found"> {
  await ensurePaymentReviews(db);
  const payloadHash = await sha256(JSON.stringify({ ...input, actorId }));
  const prior = await db.prepare("SELECT payload_hash FROM payment_review_events WHERE id=?").bind(input.requestId).first<{ payload_hash: string }>();
  if (prior) return prior.payload_hash === payloadHash ? "duplicate" : "conflict";
  const booking = await db.prepare("SELECT reference FROM bookings WHERE reference=? AND status!='binned'").bind(input.reference).first();
  if (!booking) return "not_found";
  const now = new Date().toISOString();
  // The write and its immutable history entry commit together. The event ID is a
  // transaction-specific claim, so a losing request cannot append a success event.
  const result = await db.batch([
    db.prepare("INSERT OR IGNORE INTO payment_review_state(booking_reference,updated_at) VALUES(?,?)").bind(input.reference, now),
    db.prepare(`UPDATE payment_review_state SET owner_id=CASE WHEN ?='claim' THEN ? WHEN ?='release' THEN NULL ELSE owner_id END,
      status=CASE WHEN ?='resolve' THEN 'resolved' WHEN ?='claim' THEN 'open' ELSE status END,version=version+1,last_event_id=?,updated_at=?
      WHERE booking_reference=? AND version=? AND (?='claim' AND (owner_id IS NULL OR owner_id=?) OR ?!='claim' AND owner_id=?)
      AND NOT EXISTS(SELECT 1 FROM payment_review_events WHERE id=?)
      AND (?!='resolve' OR EXISTS(SELECT 1 FROM bookings b WHERE b.reference=payment_review_state.booking_reference AND b.status!='binned'
        AND b.reconciliation_status IN ('matched','resolved') AND b.payment_status NOT IN ('disputed','failed','pending','processing')
        AND (b.payment_method!='stripe' OR b.checkout_session_id IS NOT NULL)))`)
      .bind(input.action, actorId, input.action, input.action, input.action, input.requestId, now, input.reference, input.expectedVersion, input.action, actorId, input.action, actorId, input.requestId, input.action),
    db.prepare(`INSERT OR IGNORE INTO payment_review_events(id,booking_reference,actor_id,action,note,version,payload_hash,created_at)
      SELECT ?,booking_reference,?,?,?,version,?,? FROM payment_review_state WHERE booking_reference=? AND last_event_id=?`)
      .bind(input.requestId, actorId, input.action, input.note, payloadHash, now, input.reference, input.requestId),
  ]);
  if (result[1].meta.changes === 1) return "saved";
  const completed = await db.prepare("SELECT payload_hash FROM payment_review_events WHERE id=?").bind(input.requestId).first<{ payload_hash: string }>();
  return completed?.payload_hash === payloadHash ? "duplicate" : "conflict";
}

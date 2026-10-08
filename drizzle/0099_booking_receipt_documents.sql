-- Immutable document snapshots. Concurrent downloads share the same financial-state key.
CREATE TABLE IF NOT EXISTS booking_receipt_documents (
 id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL,
 number TEXT NOT NULL UNIQUE, issued_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipt_documents_booking ON booking_receipt_documents(booking_reference);

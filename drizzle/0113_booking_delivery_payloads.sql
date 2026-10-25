CREATE TABLE IF NOT EXISTS booking_delivery_payloads (
  delivery_id TEXT PRIMARY KEY REFERENCES booking_deliveries(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL,
  parts INTEGER NOT NULL CHECK(parts>0), size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  created_at TEXT NOT NULL, first_attempt_at TEXT, send_attempts INTEGER NOT NULL DEFAULT 0,
  outcome_unknown INTEGER NOT NULL DEFAULT 0, provider_message_id TEXT, last_failure_code TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_delivery_payload_parts (
  snapshot_id TEXT NOT NULL REFERENCES booking_delivery_payloads(snapshot_id) ON DELETE CASCADE,
  part INTEGER NOT NULL CHECK(part>=0), data BLOB NOT NULL, PRIMARY KEY(snapshot_id,part)
);

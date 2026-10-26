CREATE TABLE IF NOT EXISTS notification_delivery_reviews (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('booking','telegram','assignment','chat')),
  job_id TEXT NOT NULL, expected_version TEXT NOT NULL, payload_hash TEXT NOT NULL,
  actor_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('retry','confirm_delivered','close')),
  reason TEXT NOT NULL, previous_status TEXT NOT NULL, previous_attempts INTEGER NOT NULL,
  previous_attempted_at TEXT, previous_next_attempt_at TEXT,
  confirmed_absent INTEGER NOT NULL, provider_message_id TEXT, created_at TEXT NOT NULL,
  destination_type TEXT, destination_id TEXT, use_as_root INTEGER NOT NULL DEFAULT 0,
  applied_count INTEGER NOT NULL CHECK(applied_count=1),
  UNIQUE(kind,job_id,expected_version)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_delivery_review_history ON notification_delivery_reviews(kind,job_id,sequence);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS notification_delivery_reviews_no_update BEFORE UPDATE ON notification_delivery_reviews BEGIN
  SELECT RAISE(ABORT,'Delivery review history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS notification_delivery_reviews_no_delete BEFORE DELETE ON notification_delivery_reviews BEGIN
  SELECT RAISE(ABORT,'Delivery review history is immutable');
END;

CREATE TABLE IF NOT EXISTS payment_review_state (
 booking_reference TEXT PRIMARY KEY REFERENCES bookings(reference),
 owner_id TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 version INTEGER NOT NULL DEFAULT 0,
 last_event_id TEXT,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payment_review_events (
 id TEXT PRIMARY KEY,
 booking_reference TEXT NOT NULL REFERENCES bookings(reference),
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('claim','release','note','resolve')),
 note TEXT NOT NULL,
 version INTEGER NOT NULL,
 payload_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(booking_reference,version)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_review_events_booking ON payment_review_events(booking_reference,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS payment_review_events_no_update BEFORE UPDATE ON payment_review_events BEGIN SELECT RAISE(ABORT,'Payment review history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS payment_review_events_no_delete BEFORE DELETE ON payment_review_events BEGIN SELECT RAISE(ABORT,'Payment review history is append-only'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payment_review_observations (
 id TEXT PRIMARY KEY,
 booking_reference TEXT NOT NULL REFERENCES bookings(reference),
 reason_codes_json TEXT NOT NULL,
 expected_minor INTEGER NOT NULL,
 provider_amount_minor INTEGER,
 provider_currency TEXT,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_review_observations_booking ON payment_review_observations(booking_reference,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS payment_review_observations_no_update BEFORE UPDATE ON payment_review_observations BEGIN SELECT RAISE(ABORT,'Payment observations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS payment_review_observations_no_delete BEFORE DELETE ON payment_review_observations BEGIN SELECT RAISE(ABORT,'Payment observations are append-only'); END;

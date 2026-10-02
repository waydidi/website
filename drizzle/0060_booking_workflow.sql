ALTER TABLE booking_payments ADD COLUMN amount_expected_minor INTEGER;
--> statement-breakpoint
ALTER TABLE booking_payments ADD COLUMN amount_paid_minor INTEGER;
--> statement-breakpoint
UPDATE booking_payments SET amount_expected_minor=CAST(ROUND(amount_expected*100) AS INTEGER),amount_paid_minor=CAST(ROUND(amount_paid*100) AS INTEGER);
--> statement-breakpoint
CREATE TABLE booking_policy_snapshots (
 booking_reference TEXT PRIMARY KEY REFERENCES bookings(reference), version TEXT NOT NULL,
 policy_json TEXT NOT NULL, accepted_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE booking_refunds ADD COLUMN submission_started_at TEXT;
--> statement-breakpoint
ALTER TABLE booking_refunds ADD COLUMN submission_attempts INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE booking_deliveries (
 id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL REFERENCES bookings(reference),
 channel TEXT NOT NULL, recipient TEXT, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, attempted_at TEXT, next_attempt_at TEXT,
 sent_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX booking_delivery_pending ON booking_deliveries(status,next_attempt_at);

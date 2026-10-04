ALTER TABLE smart_trips ADD COLUMN commission_paid_at TEXT;
--> statement-breakpoint
ALTER TABLE smart_trips ADD COLUMN hold_days INTEGER NOT NULL DEFAULT 7;
--> statement-breakpoint
ALTER TABLE smart_trips ADD COLUMN group_id TEXT;
--> statement-breakpoint
ALTER TABLE smart_trips ADD COLUMN day_number INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE smart_trips ADD COLUMN day_checked_at TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS smart_trips_group ON smart_trips(group_id, day_number);

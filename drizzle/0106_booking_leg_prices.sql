CREATE TABLE IF NOT EXISTS booking_leg_prices (id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, first_minor INTEGER NOT NULL, second_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL, set_by TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_booking_leg_prices_booking ON booking_leg_prices(booking_reference, created_at);

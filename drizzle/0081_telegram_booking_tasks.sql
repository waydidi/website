ALTER TABLE telegram_booking_cards ADD COLUMN cost_done INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE telegram_booking_cards ADD COLUMN driver_done INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE telegram_booking_cards ADD COLUMN assignment_posted INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE telegram_booking_cards ADD COLUMN driver_form_json TEXT;
--> statement-breakpoint
ALTER TABLE drivers ADD COLUMN license_number TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_booking_prompts (
 telegram_message_id INTEGER PRIMARY KEY, booking_reference TEXT NOT NULL, field TEXT NOT NULL, telegram_user_id TEXT, created_at TEXT NOT NULL
);

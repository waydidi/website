-- /book in the Admin Telegram group (lib/telegram/booking-builder.ts): a new booking typed in Telegram, kept as a draft
-- until a team member taps สร้างการจอง. Additive; the Worker also creates these on first use.
CREATE TABLE IF NOT EXISTS telegram_booking_drafts (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, request_message_id INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, fields_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft', booking_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS telegram_booking_drafts_request ON telegram_booking_drafts(chat_id, request_message_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_booking_draft_messages (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, draft_id TEXT NOT NULL, PRIMARY KEY (chat_id, message_id));

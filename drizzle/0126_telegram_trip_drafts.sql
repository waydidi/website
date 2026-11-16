-- /trip in the Admin Telegram group (lib/telegram/trip-builder.ts): the check-first summary, kept as a draft until a
-- team member taps สร้างทริป. A pasted customer chat is cleared once the draft is built or cancelled, and drafts are
-- deleted after 48 hours. Additive; the Worker also creates these on first use.
CREATE TABLE IF NOT EXISTS telegram_trip_drafts (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, request_message_id INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, lines_json TEXT NOT NULL DEFAULT '[]', replied_chat TEXT, version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft', state_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS telegram_trip_drafts_request ON telegram_trip_drafts(chat_id, request_message_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_trip_draft_messages (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, draft_id TEXT NOT NULL, PRIMARY KEY (chat_id, message_id));

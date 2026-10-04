-- Cee, the quote bot: what it has learned in each chat, whether it has stepped back, and which messages it wrote.
ALTER TABLE website_conversations ADD COLUMN bot_state TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN bot_paused INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE website_chat_messages ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

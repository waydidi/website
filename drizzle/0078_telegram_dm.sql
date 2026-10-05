CREATE TABLE IF NOT EXISTS telegram_dm_messages (
 chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, conversation_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY (chat_id, message_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS telegram_dm_latest ON telegram_dm_messages(chat_id, created_at);

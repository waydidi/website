CREATE TABLE IF NOT EXISTS website_telegram_staff (
 telegram_user_id TEXT PRIMARY KEY, staff_id TEXT NOT NULL UNIQUE REFERENCES staff_accounts(id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS website_telegram_deliveries (
 website_message_id TEXT PRIMARY KEY REFERENCES website_chat_messages(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES website_conversations(id) ON DELETE CASCADE,
 chat_id TEXT NOT NULL, telegram_message_id INTEGER, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT NOT NULL, lease_until TEXT,
 UNIQUE(chat_id,telegram_message_id)
);

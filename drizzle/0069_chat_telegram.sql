-- Website chat: one canonical conversation shared by the website, the admin inbox and Telegram.
ALTER TABLE website_conversations ADD COLUMN public_id TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN customer_id TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN customer_name TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN customer_email TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN customer_phone TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN source_url TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN source_title TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN topic TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN telegram_message_id INTEGER;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN last_message_at TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS website_conversations_public_id ON website_conversations(public_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS website_conversations_telegram ON website_conversations(telegram_message_id);
--> statement-breakpoint
ALTER TABLE website_chat_messages ADD COLUMN sender_name TEXT;
--> statement-breakpoint
ALTER TABLE website_chat_messages ADD COLUMN client_id TEXT;
--> statement-breakpoint
ALTER TABLE website_chat_messages ADD COLUMN telegram_message_id INTEGER;
--> statement-breakpoint
ALTER TABLE website_chat_messages ADD COLUMN telegram_status TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS website_chat_messages_client ON website_chat_messages(conversation_id, client_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS website_chat_messages_telegram ON website_chat_messages(telegram_message_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS website_chat_assignments (
 conversation_id TEXT PRIMARY KEY REFERENCES website_conversations(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff_accounts(id), staff_name TEXT NOT NULL, assigned_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN assigned_staff_id TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN assigned_telegram_user_id TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN assigned_name TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN assigned_at TEXT;
--> statement-breakpoint
UPDATE website_conversations SET assigned_staff_id=(SELECT staff_id FROM website_chat_assignments a WHERE a.conversation_id=website_conversations.id),
 assigned_name=(SELECT staff_name FROM website_chat_assignments a WHERE a.conversation_id=website_conversations.id),
 assigned_at=(SELECT assigned_at FROM website_chat_assignments a WHERE a.conversation_id=website_conversations.id)
 WHERE assigned_staff_id IS NULL AND EXISTS(SELECT 1 FROM website_chat_assignments a WHERE a.conversation_id=website_conversations.id);
--> statement-breakpoint
UPDATE website_chat_messages SET sender_name=COALESCE((SELECT a.staff_name FROM website_chat_assignments a WHERE a.conversation_id=website_chat_messages.conversation_id AND a.staff_id=website_chat_messages.staff_id),(SELECT display_name FROM staff_accounts s WHERE s.id=website_chat_messages.staff_id))
 WHERE sender='staff' AND sender_name IS NULL;
--> statement-breakpoint
UPDATE website_conversations SET last_message_at=COALESCE((SELECT MAX(created_at) FROM website_chat_messages m WHERE m.conversation_id=website_conversations.id),updated_at) WHERE last_message_at IS NULL;
--> statement-breakpoint
UPDATE website_conversations SET public_id='WD-'||upper(substr(id,1,6)) WHERE public_id IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_admins (
 id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL UNIQUE, telegram_username TEXT, display_name TEXT NOT NULL,
 staff_id TEXT REFERENCES staff_accounts(id), enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_events (
 update_id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, processing_status TEXT NOT NULL, processed_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_booking_cards (
 booking_reference TEXT PRIMARY KEY, telegram_message_id INTEGER NOT NULL, acknowledged_by TEXT, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_reply_prompts (
 telegram_message_id INTEGER PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES website_conversations(id) ON DELETE CASCADE, created_at TEXT NOT NULL
);

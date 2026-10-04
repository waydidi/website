CREATE TABLE IF NOT EXISTS cee_knowledge (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'faq', city TEXT, body TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'admin', created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cee_knowledge_active ON cee_knowledge(active, kind);
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'web';
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN channel_user_id TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN bot_thinking_at TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS website_conversations_channel_user ON website_conversations(channel, channel_user_id);
--> statement-breakpoint
ALTER TABLE website_chat_messages ADD COLUMN channel_message_id TEXT;

CREATE TABLE website_conversations (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE website_chat_messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES website_conversations(id),
 sender TEXT NOT NULL CHECK(sender IN ('visitor','staff')), body TEXT NOT NULL,
 staff_id TEXT REFERENCES staff_accounts(id), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX chat_conversation_time ON website_chat_messages(conversation_id,created_at);

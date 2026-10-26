CREATE TABLE IF NOT EXISTS telegram_assignment_payloads (
  id TEXT PRIMARY KEY REFERENCES booking_notifications(id) ON DELETE CASCADE,
  payload_json TEXT, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  next_attempt_at TEXT, provider_message_id INTEGER, last_error TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_chat_payloads (
  id TEXT PRIMARY KEY REFERENCES website_chat_messages(id) ON DELETE CASCADE,
  payload_json TEXT, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  next_attempt_at TEXT, provider_message_id INTEGER, last_error TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_chat_card_claims (
  conversation_id TEXT PRIMARY KEY REFERENCES website_conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES website_chat_messages(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL, attempted_at TEXT NOT NULL
);

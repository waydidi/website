CREATE TABLE IF NOT EXISTS chat_payment_links (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, kind TEXT NOT NULL, details_json TEXT NOT NULL, vehicle TEXT NOT NULL, amount INTEGER NOT NULL,
 customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 booking_reference TEXT, provider TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, paid_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_payment_links_conversation ON chat_payment_links(conversation_id, status);

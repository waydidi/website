-- /trip and /place in the Telegram Admin group: each staff message is handled once (a webhook retry cannot build a second trip),
-- and bot confirmations for /place remember their attraction so photos sent as replies are added to it.
CREATE TABLE IF NOT EXISTS telegram_trip_builder (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, kind TEXT NOT NULL, ref_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (chat_id, message_id));

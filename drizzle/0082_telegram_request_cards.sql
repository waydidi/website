CREATE TABLE IF NOT EXISTS telegram_request_cards (
 id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, kind TEXT NOT NULL, telegram_message_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
);

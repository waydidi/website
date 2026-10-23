-- /trip in the Telegram Admin group: a trip waiting for staff to choose the package of each place that has packages.
-- step counts the answered questions, so two taps on the same question cannot both count.
CREATE TABLE IF NOT EXISTS telegram_trip_pending (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, step INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);

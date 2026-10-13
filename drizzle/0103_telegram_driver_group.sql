-- Telegram driver group: job offers, drivers' linked Telegram accounts and their sign-up answers.
CREATE TABLE IF NOT EXISTS telegram_driver_jobs (
 booking_reference TEXT PRIMARY KEY, telegram_message_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open',
 holder_telegram_id TEXT, hold_until TEXT, driver_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_driver_links (
 telegram_user_id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, linked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_driver_links_driver ON telegram_driver_links(driver_id);
CREATE TABLE IF NOT EXISTS telegram_driver_forms (
 telegram_user_id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, step TEXT NOT NULL, driver_id TEXT NOT NULL,
 form_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
);

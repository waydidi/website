-- Which driver group a job was offered in (the south group for a pickup in the south of Thailand).
-- A job with no row here was offered in the main driver group. Also created on first use in lib/telegram/driver-group.ts.
CREATE TABLE IF NOT EXISTS telegram_driver_job_chats (
 booking_reference TEXT PRIMARY KEY, chat_id TEXT NOT NULL
);

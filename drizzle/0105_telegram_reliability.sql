CREATE TABLE IF NOT EXISTS telegram_driver_leg_costs (booking_reference TEXT NOT NULL, leg TEXT NOT NULL, cost_minor INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(booking_reference,leg));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_prompt_answers (prompt_id INTEGER PRIMARY KEY, answer_id TEXT NOT NULL UNIQUE, next_field TEXT, applied_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_assignment_messages (assignment_id TEXT PRIMARY KEY, header TEXT, reply_to INTEGER, driver_dm INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dispatch_revision (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, claim_id TEXT);
--> statement-breakpoint
INSERT OR IGNORE INTO dispatch_revision(id,version) VALUES(1,0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_chat_delivery_attempts (message_id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, attempted_at TEXT NOT NULL, destination TEXT, attempts INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_message_routes (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, conversation_id TEXT NOT NULL, PRIMARY KEY(chat_id,message_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_delivery_jobs (id TEXT PRIMARY KEY, booking_reference TEXT, leg TEXT, destination TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, attempted_at TEXT, sent_at TEXT, telegram_message_id INTEGER, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_telegram_delivery_ready ON telegram_delivery_jobs(status,next_attempt_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_cancellation_requests (id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, requested_at TEXT NOT NULL, policy_version TEXT, status TEXT NOT NULL DEFAULT 'pending', resolved_at TEXT);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_pending ON booking_cancellation_requests(booking_reference) WHERE status='pending';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_archives (booking_reference TEXT PRIMARY KEY, archived_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_prompt_context (message_id INTEGER PRIMARY KEY, booking_version INTEGER NOT NULL, consumed_at TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_assistant_budget (month TEXT PRIMARY KEY, spent_microusd INTEGER NOT NULL DEFAULT 0, reserved_microusd INTEGER NOT NULL DEFAULT 0, questions INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_assistant_reservations (id TEXT PRIMARY KEY, month TEXT NOT NULL, reserved_microusd INTEGER NOT NULL, spent_microusd INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'reserved', created_at TEXT NOT NULL);

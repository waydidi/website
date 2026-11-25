-- Sales Intelligence PR 6 (additive): 3-day quote reminders sent as approved WhatsApp templates, after the customer's YES.
-- Also created on first use by lib/sales-ai/reminders.ts, because Workers Builds does not apply D1 migrations.
CREATE TABLE IF NOT EXISTS ai_template_reminders(bundle_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,consent_message_id TEXT NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','running','sent','suppressed','cancelled','unknown')),reason TEXT,lease_until TEXT,channel_message_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_template_reminders_due ON ai_template_reminders(status,due_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_whatsapp_templates(name TEXT NOT NULL,language TEXT NOT NULL,status TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(name,language));

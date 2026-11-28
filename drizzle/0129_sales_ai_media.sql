-- Sales Intelligence PR 4: detail records for existing drafts and WhatsApp media.
CREATE TABLE IF NOT EXISTS ai_quote_legs(draft_id TEXT NOT NULL,leg_no INTEGER NOT NULL,pickup TEXT NOT NULL,dropoff TEXT NOT NULL,trip_date TEXT NOT NULL,trip_time TEXT NOT NULL,passengers INTEGER NOT NULL,bags INTEGER NOT NULL,options_json TEXT NOT NULL,selected INTEGER NOT NULL DEFAULT 0,price_thb INTEGER,table_price_thb INTEGER,edited INTEGER NOT NULL DEFAULT 0,crm_quote_id TEXT,crm_version INTEGER,PRIMARY KEY(draft_id,leg_no));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_quote_legs_quote ON ai_quote_legs(crm_quote_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_quote_leg_prompts(telegram_message_id INTEGER PRIMARY KEY,leg_no INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_quote_needs(draft_id TEXT PRIMARY KEY,child_seats INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS whatsapp_media_reads(media_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('reading','read','refused','failed')),file_key TEXT,sha256 TEXT,bytes INTEGER,mime_type TEXT,facts_json TEXT,reason TEXT,attempts INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_media_reads_conversation ON whatsapp_media_reads(conversation_id,created_at);

-- Sales Intelligence PR 1 (additive). Also created on first use by lib/sales-ai/activity-log.ts,
-- because Workers Builds does not apply D1 migrations.
CREATE TABLE IF NOT EXISTS ai_activity_log(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,event TEXT NOT NULL,status TEXT NOT NULL,actor TEXT NOT NULL,channel TEXT,conversation_id TEXT,correlation_id TEXT,dedupe_key TEXT UNIQUE,model TEXT,latency_ms INTEGER,input_tokens INTEGER,output_tokens INTEGER,cost_usd_micros INTEGER,price_version TEXT,summary TEXT NOT NULL,detail_json TEXT);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_activity_created ON ai_activity_log(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_activity_conversation ON ai_activity_log(conversation_id,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_activity_event ON ai_activity_log(event,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS whatsapp_media(media_id TEXT PRIMARY KEY,conversation_id TEXT,channel_message_id TEXT NOT NULL,kind TEXT NOT NULL,mime_type TEXT,sha256 TEXT,received_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_media_conversation ON whatsapp_media(conversation_id,received_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS channel_delivery_status(channel_message_id TEXT PRIMARY KEY,channel TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('sent','delivered','read','failed')),error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);

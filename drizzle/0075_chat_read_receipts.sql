ALTER TABLE website_conversations ADD COLUMN read_seq INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN read_by TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN read_at TEXT;

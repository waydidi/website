ALTER TABLE website_conversations ADD COLUMN bot_lock_until TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN telegram_card_at TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN line_reply_token TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN line_reply_token_at TEXT;

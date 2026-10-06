CREATE TABLE IF NOT EXISTS chat_alerts (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, areas TEXT NOT NULL DEFAULT '', effect TEXT NOT NULL DEFAULT 'warn',
 starts_at TEXT NOT NULL, ends_at TEXT, source_url TEXT, active INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS place_searches (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, actor TEXT NOT NULL, query_key TEXT NOT NULL, cached INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_place_searches_conv ON place_searches(conversation_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_place_searches_actor ON place_searches(actor, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS place_search_cache (query_key TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at TEXT NOT NULL);

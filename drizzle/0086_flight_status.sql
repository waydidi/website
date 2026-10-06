CREATE TABLE IF NOT EXISTS flight_lookups (
 cache_key TEXT PRIMARY KEY, result_json TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS flight_api_usage (
 day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0
);

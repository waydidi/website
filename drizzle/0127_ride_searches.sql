-- Searched transfers behind /reservation?ride=… (lib/ride-search-db.ts). Trip inputs only (places, date, people);
-- rows expire after 7 days and expired rows are deleted when new ones are saved. Additive; the Worker also creates
-- this table on first use.
CREATE TABLE IF NOT EXISTS ride_searches (id TEXT PRIMARY KEY, search_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ride_searches_expires ON ride_searches(expires_at);

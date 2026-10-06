CREATE TABLE IF NOT EXISTS flight_stats (
 day TEXT PRIMARY KEY, stats_json TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
);

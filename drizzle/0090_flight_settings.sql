CREATE TABLE IF NOT EXISTS flight_settings (
 id INTEGER PRIMARY KEY CHECK (id = 1), daily_cap INTEGER NOT NULL DEFAULT 300, usd_per_call REAL NOT NULL DEFAULT 0, updated_by TEXT, updated_at TEXT
);

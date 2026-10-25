CREATE TABLE IF NOT EXISTS booking_funnel_events (event_id TEXT PRIMARY KEY,journey_hash TEXT NOT NULL,stage TEXT NOT NULL CHECK(stage IN ('quote','details','payment','confirmed')),service TEXT NOT NULL CHECK(service IN ('transfer','hourly')),created_at TEXT NOT NULL,UNIQUE(journey_hash,stage));
CREATE INDEX IF NOT EXISTS booking_funnel_events_cohort ON booking_funnel_events(stage,created_at);
CREATE TABLE IF NOT EXISTS booking_funnel_links (booking_hash TEXT PRIMARY KEY,journey_hash TEXT NOT NULL UNIQUE,service TEXT NOT NULL CHECK(service IN ('transfer','hourly')),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS booking_funnel_optouts (journey_hash TEXT PRIMARY KEY,created_at TEXT NOT NULL);

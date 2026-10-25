-- Additive tour support: existing event/link tables and their constraints stay intact.
CREATE TABLE IF NOT EXISTS booking_funnel_tour_events (event_id TEXT PRIMARY KEY,journey_hash TEXT NOT NULL,stage TEXT NOT NULL CHECK(stage IN ('quote','details','payment','confirmed')),service TEXT NOT NULL CHECK(service='tour'),created_at TEXT NOT NULL,UNIQUE(journey_hash,stage));
CREATE INDEX IF NOT EXISTS booking_funnel_tour_events_cohort ON booking_funnel_tour_events(stage,created_at);
CREATE TABLE IF NOT EXISTS booking_funnel_tour_links (booking_hash TEXT PRIMARY KEY,journey_hash TEXT NOT NULL,service TEXT NOT NULL CHECK(service='tour'),created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS booking_funnel_tour_links_journey ON booking_funnel_tour_links(journey_hash);

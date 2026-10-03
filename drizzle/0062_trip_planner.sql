CREATE TABLE IF NOT EXISTS suppliers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'attraction',
 contact_name TEXT, phone TEXT, line_id TEXT, whatsapp TEXT, email TEXT, notes TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS attractions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, customer_name TEXT, area TEXT NOT NULL DEFAULT '',
 address TEXT, latitude REAL, longitude REAL, google_place_id TEXT, category TEXT NOT NULL DEFAULT 'sight',
 tags_json TEXT NOT NULL DEFAULT '[]', open_time TEXT, close_time TEXT, last_entry TEXT,
 closed_days_json TEXT NOT NULL DEFAULT '[]', duration_min INTEGER NOT NULL DEFAULT 60,
 arrival_buffer_min INTEGER NOT NULL DEFAULT 0, booking_required INTEGER NOT NULL DEFAULT 0,
 weather_sensitive INTEGER NOT NULL DEFAULT 0, dress_code TEXT, description TEXT,
 highlights_json TEXT NOT NULL DEFAULT '[]', bring_json TEXT NOT NULL DEFAULT '[]',
 cover_image TEXT, gallery_json TEXT NOT NULL DEFAULT '[]', image_credit TEXT, website TEXT, phone TEXT,
 internal_notes TEXT, supplier_id TEXT REFERENCES suppliers(id),
 programs_json TEXT NOT NULL DEFAULT '[]', exceptions_json TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'active', verified_at TEXT, verified_by TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS attractions_area ON attractions(area, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS smart_trips (
 id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'draft',
 title TEXT NOT NULL, area TEXT NOT NULL DEFAULT '', trip_date TEXT, start_time TEXT NOT NULL DEFAULT '08:00',
 pickup_text TEXT NOT NULL DEFAULT '', pickup_lat REAL, pickup_lng REAL,
 end_text TEXT, end_lat REAL, end_lng REAL, duration_hours INTEGER NOT NULL DEFAULT 8,
 adults INTEGER NOT NULL DEFAULT 2, children INTEGER NOT NULL DEFAULT 0, bags INTEGER NOT NULL DEFAULT 0,
 vehicle TEXT NOT NULL DEFAULT 'comfort_suv', language TEXT NOT NULL DEFAULT 'en',
 customer_name TEXT, customer_email TEXT, customer_phone TEXT, notes TEXT,
 stops_json TEXT NOT NULL DEFAULT '[]', transport_price INTEGER NOT NULL DEFAULT 0,
 fees_total INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
 token TEXT NOT NULL UNIQUE, is_template INTEGER NOT NULL DEFAULT 0, template_name TEXT,
 agency_id TEXT, commission_percent INTEGER NOT NULL DEFAULT 0, created_by TEXT,
 snapshot_json TEXT, version INTEGER NOT NULL DEFAULT 0, sent_at TEXT, viewed_at TEXT, accepted_at TEXT,
 change_request TEXT, booking_reference TEXT, thanked_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS smart_trips_status ON smart_trips(is_template, status, trip_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS smart_trips_booking ON smart_trips(booking_reference);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS smart_trip_versions (
 id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES smart_trips(id), version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL, note TEXT, created_by TEXT, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS smart_trip_version_unique ON smart_trip_versions(trip_id, version);

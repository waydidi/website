CREATE TABLE IF NOT EXISTS trip_packages (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, city TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES smart_trips(id),
 name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'half_day', summary TEXT, highlights_json TEXT NOT NULL DEFAULT '[]',
 included_json TEXT NOT NULL DEFAULT '[]', excluded_json TEXT NOT NULL DEFAULT '[]', start_times_json TEXT NOT NULL DEFAULT '["08:00"]',
 cover_image TEXT, prices_json TEXT NOT NULL DEFAULT '{}', min_notice_hours INTEGER NOT NULL DEFAULT 24, published INTEGER NOT NULL DEFAULT 0,
 sort_order INTEGER NOT NULL DEFAULT 0, i18n_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trip_packages_city ON trip_packages(city, published, sort_order);
--> statement-breakpoint
ALTER TABLE smart_trips ADD COLUMN package_id TEXT;

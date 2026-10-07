CREATE TABLE IF NOT EXISTS affiliates (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 email TEXT, phone TEXT, kind TEXT NOT NULL DEFAULT 'creator', commission_percent REAL NOT NULL DEFAULT 8,
 discount_percent REAL NOT NULL DEFAULT 5, status TEXT NOT NULL DEFAULT 'active', notes TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS affiliate_clicks (
 affiliate_id TEXT NOT NULL, day TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (affiliate_id, day)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_affiliates (
 booking_reference TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, via TEXT NOT NULL, fare_before_discount INTEGER NOT NULL,
 discount INTEGER NOT NULL DEFAULT 0, commission_percent REAL NOT NULL, commission INTEGER NOT NULL,
 paid_at TEXT, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_booking_affiliates_affiliate ON booking_affiliates(affiliate_id);

CREATE TABLE IF NOT EXISTS referral_codes (customer_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_uses (
 booking_reference TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, friend_email TEXT, friend_phone TEXT,
 status TEXT NOT NULL DEFAULT 'pending', reward_code TEXT, created_at TEXT NOT NULL, rewarded_at TEXT
);

CREATE TABLE staff_accounts (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
 display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','operations','finance','editor','support')),
 mfa_secret TEXT, last_totp_step INTEGER NOT NULL DEFAULT -1,
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE staff_sessions (
 token_hash TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff_accounts(id),
 expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX staff_sessions_staff ON staff_sessions(staff_id);
--> statement-breakpoint
CREATE TABLE staff_challenges (
 token_hash TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff_accounts(id),
 enrollment_secret TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 expires_at TEXT NOT NULL, consumed_at TEXT
);
--> statement-breakpoint
CREATE TABLE security_rate_windows (
 fingerprint TEXT NOT NULL, window INTEGER NOT NULL, attempts INTEGER NOT NULL,
 PRIMARY KEY(fingerprint, window)
);
--> statement-breakpoint
DELETE FROM booking_management_sessions;
--> statement-breakpoint
CREATE TABLE trip_access_sessions (
 token_hash TEXT PRIMARY KEY, booking_reference TEXT NOT NULL REFERENCES bookings(reference),
 access TEXT NOT NULL CHECK(access IN ('owner','shared')), issued_at INTEGER NOT NULL, expires_at TEXT NOT NULL
);

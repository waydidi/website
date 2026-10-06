CREATE TABLE IF NOT EXISTS booking_links (
 booking_reference TEXT NOT NULL, leg TEXT NOT NULL DEFAULT 'outbound', driver_token TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY (booking_reference, leg)
);

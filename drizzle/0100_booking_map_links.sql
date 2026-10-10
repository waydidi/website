-- Google Maps share links an admin sets for a booking from Telegram; the driver's Pick up / Drop buttons
-- open them. Their own table: the bookings table is at D1's 100-column limit.
CREATE TABLE IF NOT EXISTS booking_map_links (
 booking_reference TEXT PRIMARY KEY, pickup_map_url TEXT, dropoff_map_url TEXT, updated_by TEXT, updated_at TEXT NOT NULL
);

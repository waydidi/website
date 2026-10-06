CREATE TABLE IF NOT EXISTS flight_watch (
 booking_reference TEXT PRIMARY KEY, flight_number TEXT NOT NULL, last_eta TEXT, last_status TEXT, notified_at TEXT, checked_at TEXT
);

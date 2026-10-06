CREATE TABLE IF NOT EXISTS flight_tracked (
 day TEXT NOT NULL, flight_number TEXT NOT NULL, flight_date TEXT NOT NULL, searches INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (day, flight_number, flight_date)
);
